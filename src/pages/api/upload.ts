import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import mime from 'mime';
import { nanoid, customAlphabet } from 'nanoid';
import { findByHash, findBySlug, insertFile, createPendingUpload } from '../../lib/db';
import { uploadToFilebase, createPresignedPutUrl, createPresignedGetUrl } from '../../lib/filebase';
import { detectLanguage } from '../../lib/language';
import { getCurrentCurator } from '../../lib/auth';
import { checkUploadRateLimit } from '../../lib/ratelimit';
import {
  getClientIP,
  getPublicURL,
  getUploadMaxSize,
  getPresignMaxSize,
  getErrorMessage,
  jsonResponse,
} from '../../lib/utils';
import type { FileRecord } from '../../lib/db';

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function parseExpiresAt(expiresIn: string | null): string | null {
  const seconds = parseInt(expiresIn || '0', 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

const generateSlug = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

interface UploadResponse {
  slug: string;
  cid: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  directUrl: string;
  authorToken?: string;
}

function buildResponse(
  record: Pick<FileRecord, 'slug' | 'cid' | 'filename' | 'mime' | 'size'>,
  request: Request,
  authorToken?: string
): UploadResponse {
  const base = getPublicURL(request);
  return {
    slug: record.slug,
    cid: record.cid,
    filename: record.filename,
    mime: record.mime,
    size: Number(record.size),
    url: `${base}/f/${record.slug}`,
    directUrl: `https://ipfs.filebase.io/ipfs/${record.cid}`,
    ...(authorToken ? { authorToken } : {}),
  };
}

async function generateUniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const slug = generateSlug();
    const existing = await findBySlug(slug);
    if (!existing) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const request = context.request;
    const ip = getClientIP(request);

    const rate = await checkUploadRateLimit(ip);
    if (!rate.allowed) {
      return jsonResponse(
        { error: 'Too many uploads. Please try again later.' },
        429,
        { headers: { 'X-RateLimit-Limit': String(rate.limit), 'X-RateLimit-Remaining': '0' } }
      );
    }

    const formData = await request.formData();
    const mode = typeof formData.get('mode') === 'string' ? (formData.get('mode') as string).trim() : '';

    if (mode === 'presign') {
      return handlePresign({ formData, request });
    }

    const file = formData.get('file');
    const password = typeof formData.get('password') === 'string' ? (formData.get('password') as string).trim() : '';
    const expiresIn = typeof formData.get('expires_in') === 'string' ? (formData.get('expires_in') as string).trim() : '0';
    const visibility = typeof formData.get('visibility') === 'string' ? (formData.get('visibility') as string).trim() : 'public';
    const isPublic = visibility === 'public';
    const isPrivate = visibility === 'private';
    const forkedFrom = typeof formData.get('forked_from') === 'string' ? (formData.get('forked_from') as string).trim() || null : null;
    const curator = await getCurrentCurator(context.cookies);

    if (isPrivate && !password) {
      return jsonResponse({ error: 'A password is required for a private bin' }, 400);
    }

    if (forkedFrom && !curator) {
      return jsonResponse({ error: 'Login required to fork' }, 401);
    }

    const passwordHash = isPrivate ? hashPassword(password) : null;
    const viewOnce = expiresIn === '-1';
    const expiresAt = viewOnce ? null : parseExpiresAt(expiresIn);

    const authorToken = nanoid(32);
    const authorTokenHash = createHash('sha256').update(authorToken).digest('hex');

    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse({ error: 'No valid file was provided' }, 400);
    }

    const maxSize = getUploadMaxSize();
    if (file.size > maxSize) {
      return jsonResponse(
        { error: `The file exceeds the maximum size of ${formatSize(maxSize)}` },
        413
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = createHash('sha256').update(buffer).digest('hex');

    if (isPublic && !forkedFrom) {
      const existing = await findByHash(hash);
      if (existing) {
        return jsonResponse(buildResponse(existing, request), 200, {
          headers: {
            'X-RateLimit-Limit': String(rate.limit),
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        });
      }
    }

    const contentType = file.type || mime.getType(file.name) || 'application/octet-stream';
    const cid = await uploadToFilebase(hash, buffer, contentType);
    const slug = await generateUniqueSlug();

    const language =
      typeof formData.get('language') === 'string'
        ? (formData.get('language') as string).trim() || detectLanguage(file.name || 'unknown')
        : detectLanguage(file.name || 'unknown');

    const record = await insertFile({
      slug,
      sha256: hash,
      cid,
      filename: file.name || 'unknown',
      mime: contentType,
      size: file.size,
      author: curator ? curator.username : null,
      password_hash: passwordHash,
      expires_at: expiresAt,
      view_once: viewOnce,
      author_token: authorTokenHash,
      forked_from: forkedFrom,
      curator_id: curator ? curator.id : null,
      language,
      score: 0,
      report_count: 0,
      hidden: false,
      is_public: isPublic,
    });

    return jsonResponse(buildResponse(record, request, authorToken), 200, {
      headers: {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// PRESIGN_EXPIRES_SECONDS define cuánto vive la URL firmada de subida.
const PRESIGN_EXPIRES_SECONDS = 900; // 15 min
const SHA256_RE = /^[0-9a-f]{64}$/i;

interface PresignInput {
  formData: FormData;
  request: Request;
}

// handlePresign implementa el modo gitGost: no recibe el archivo; devuelve una
// URL presignada de Filebase para subir el objeto directo (sin pasar por la
// función serverless) y un token para confirmar el registro después del PUT.
async function handlePresign({ formData, request }: PresignInput): Promise<Response> {
  const sha256 = typeof formData.get('sha256') === 'string' ? (formData.get('sha256') as string).trim().toLowerCase() : '';
  const size = parseInt(typeof formData.get('size') === 'string' ? (formData.get('size') as string) : '0', 10);
  const filename = typeof formData.get('filename') === 'string' && (formData.get('filename') as string).trim()
    ? (formData.get('filename') as string).trim()
    : 'file.bin';
  const mime = typeof formData.get('mime') === 'string' && (formData.get('mime') as string).trim()
    ? (formData.get('mime') as string).trim()
    : 'application/octet-stream';
  const expiresIn = typeof formData.get('expires_in') === 'string' ? (formData.get('expires_in') as string).trim() : '0';
  const expiresAt = parseExpiresAt(expiresIn);

  if (!SHA256_RE.test(sha256)) {
    return jsonResponse({ error: 'Invalid sha256 (expected 64 hex chars)' }, 400);
  }
  const maxSize = getPresignMaxSize();
  if (!Number.isFinite(size) || size <= 0 || size > maxSize) {
    return jsonResponse({ error: `Invalid size (max ${formatSize(maxSize)})` }, 400);
  }

  // Dedup: si ya existe un bin público y vigente con el mismo contenido, no hace
  // falta volver a subir el objeto: se devuelve el bin existente con una URL de
  // descarga firmada fresca.
  const existing = await findByHash(sha256);
  if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
    const downloadUrl = await createPresignedGetUrl(sha256);
    return jsonResponse({
      mode: 'presign',
      alreadyExists: true,
      slug: existing.slug,
      cid: existing.cid,
      filename: existing.filename,
      mime: existing.mime,
      size: Number(existing.size),
      url: `${getPublicURL(request)}/f/${existing.slug}`,
      directUrl: `https://ipfs.filebase.io/ipfs/${existing.cid}`,
      downloadUrl,
    }, 200);
  }

  const uploadToken = nanoid(32);
  const tokenHash = createHash('sha256').update(uploadToken).digest('hex');
  const presignExpiresAt = new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString();

  await createPendingUpload({
    token_hash: tokenHash,
    sha256,
    filename,
    mime,
    size,
    expires_at: expiresAt,
    presign_expires_at: presignExpiresAt,
  });

  const presignedUrl = await createPresignedPutUrl(sha256, mime, PRESIGN_EXPIRES_SECONDS);
  return jsonResponse({
    mode: 'presign',
    alreadyExists: false,
    presignedUrl,
    uploadToken,
    expiresIn: PRESIGN_EXPIRES_SECONDS,
    sha256,
    size,
  }, 200);
}
