import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import mime from 'mime';
import { customAlphabet } from 'nanoid';
import { findByHash, findBySlug, insertFile } from '../../lib/db';
import { uploadToFilebase } from '../../lib/filebase';
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
}

function buildResponse(record: Pick<FileRecord, 'slug' | 'cid' | 'filename' | 'mime' | 'size'>, request: Request): UploadResponse {
  const base = getPublicURL(request);
  return {
    slug: record.slug,
    cid: record.cid,
    filename: record.filename,
    mime: record.mime,
    size: Number(record.size),
    url: `${base}/f/${record.slug}`,
    directUrl: `https://ipfs.filebase.io/ipfs/${record.cid}`,
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
    const author = typeof formData.get('author') === 'string' ? (formData.get('author') as string).trim() || null : null;
    const password = typeof formData.get('password') === 'string' ? (formData.get('password') as string).trim() : '';
    const expiresIn = typeof formData.get('expires_in') === 'string' ? (formData.get('expires_in') as string).trim() : '0';
    const isPublic = formData.get('is_public') === 'true';

    const passwordHash = isPublic ? null : password ? hashPassword(password) : null;
    const expiresAt = parseExpiresAt(expiresIn);

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

    const existing = await findByHash(hash);
    if (existing) {
      return jsonResponse(buildResponse(existing, request), 200, {
        headers: {
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      });
    }

    const contentType = file.type || mime.getType(file.name) || 'application/octet-stream';
    const cid = await uploadToFilebase(hash, buffer, contentType);
    const slug = await generateUniqueSlug();

    const record = await insertFile({
      slug,
      sha256: hash,
      cid,
      filename: file.name || 'unknown',
      mime: contentType,
      size: file.size,
      author,
      password_hash: passwordHash,
      expires_at: expiresAt,
    });

    return jsonResponse(buildResponse(record, request), 200, {
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
