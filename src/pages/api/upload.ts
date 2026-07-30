import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import mime from 'mime';
import { nanoid, customAlphabet } from 'nanoid';
import { findByHash, findBySlug, insertFile } from '../../lib/db';
import { uploadToFilebase } from '../../lib/filebase';
import { detectLanguage } from '../../lib/language';
import { getCurrentCurator } from '../../lib/auth';
import { checkUploadRateLimit } from '../../lib/ratelimit';
import {
  getClientIP,
  getPublicURL,
  getUploadMaxSize,
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
