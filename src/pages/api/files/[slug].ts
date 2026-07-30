import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import mime from 'mime';
import {
  findBySlug,
  updateFileContent,
  deleteBySlug,
  hasForks,
  countByHash,
} from '../../../lib/db';
import { downloadFromFilebase, uploadToFilebase, deleteFromFilebase } from '../../../lib/filebase';
import { detectLanguage } from '../../../lib/language';
import { getPublicURL, getUploadMaxSize, getErrorMessage, jsonResponse } from '../../../lib/utils';
import type { FileRecord } from '../../../lib/db';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function buildResponse(record: Pick<FileRecord, 'slug' | 'cid' | 'filename' | 'mime' | 'size'>, request: Request) {
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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function verifyEditAccess(record: FileRecord, token: string | null, slug: string): Promise<Response | null> {
  if (!token || !record.author_token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const tokenHash = hashToken(token);
  if (tokenHash !== record.author_token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const now = Date.now();
  if (record.expires_at && new Date(record.expires_at).getTime() <= now) {
    return jsonResponse({ error: 'Expired' }, 403);
  }
  if (now - new Date(record.created_at).getTime() > TWO_HOURS_MS) {
    return jsonResponse({ error: 'Edit window expired' }, 403);
  }
  if (await hasForks(slug)) {
    return jsonResponse({ error: 'This bin has been forked' }, 403);
  }
  return null;
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const slug = context.params.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const token = context.url.searchParams.get('token');
    const record = await findBySlug(slug);
    if (!record) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const authError = await verifyEditAccess(record, token, slug);
    if (authError) return authError;

    const buffer = await downloadFromFilebase(record.sha256);
    const code = buffer.toString('utf-8');

    return jsonResponse({
      slug: record.slug,
      filename: record.filename,
      code,
      author: record.author,
      mime: record.mime,
      size: Number(record.size),
      hasPassword: !!record.password_hash,
      viewOnce: record.view_once,
      expiresAt: record.expires_at,
    });
  } catch (error: unknown) {
    console.error('Edit load error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const slug = context.params.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const record = await findBySlug(slug);
    if (!record) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const formData = await context.request.formData();
    const token = typeof formData.get('author_token') === 'string' ? (formData.get('author_token') as string).trim() : '';
    const authError = await verifyEditAccess(record, token, slug);
    if (authError) return authError;

    const file = formData.get('file');
    const author = typeof formData.get('author') === 'string' ? (formData.get('author') as string).trim() || null : null;

    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse({ error: 'No valid file was provided' }, 400);
    }

    const maxSize = getUploadMaxSize();
    if (file.size > maxSize) {
      return jsonResponse({ error: `The file exceeds the maximum size of ${formatSize(maxSize)}` }, 413);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const contentType = file.type || mime.getType(file.name) || record.mime || 'application/octet-stream';
    const cid = await uploadToFilebase(hash, buffer, contentType);

    const language =
      typeof formData.get('language') === 'string'
        ? (formData.get('language') as string).trim() || detectLanguage(file.name || record.filename)
        : detectLanguage(file.name || record.filename);

    const oldSha256 = record.sha256;
    const updated = await updateFileContent(slug, {
      sha256: hash,
      cid,
      filename: file.name || record.filename,
      mime: contentType,
      size: file.size,
      author,
      language,
    });

    if (!updated) {
      return jsonResponse({ error: 'Could not update the file' }, 500);
    }

    if (oldSha256 !== hash) {
      const remaining = await countByHash(oldSha256);
      if (remaining === 0) {
        try {
          await deleteFromFilebase(oldSha256);
        } catch {
          // Object may already be gone or deletion failed; the DB is the source of truth.
        }
      }
    }

    return jsonResponse(buildResponse(updated, context.request), 200);
  } catch (error: unknown) {
    console.error('Edit error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const slug = context.params.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const record = await findBySlug(slug);
    if (!record) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const token = context.url.searchParams.get('token');
    const authError = await verifyEditAccess(record, token, slug);
    if (authError) return authError;

    const deleted = await deleteBySlug(slug);
    if (!deleted) {
      return jsonResponse({ error: 'Could not delete the file' }, 500);
    }

    const remaining = await countByHash(deleted.sha256);
    if (remaining === 0) {
      try {
        await deleteFromFilebase(deleted.sha256);
      } catch {
        // Ignore Filebase errors; the slug is already gone from the DB.
      }
    }

    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    console.error('Delete error:', error);
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
