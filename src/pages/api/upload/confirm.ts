import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import {
  findBySlug,
  findByHash,
  insertFile,
  findPendingByToken,
  deletePendingByToken,
} from '../../../lib/db';
import { getObjectInfo, createPresignedGetUrl } from '../../../lib/filebase';
import { getPublicURL, getErrorMessage, jsonResponse } from '../../../lib/utils';

const generateSlug = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

// generateUniqueSlug: misma lógica que en upload.ts (mantenida por separado
// para no acoplar las rutas entre sí).
async function generateUniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const slug = generateSlug();
    const existing = await findBySlug(slug);
    if (!existing) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

// POST /api/upload/confirm confirma un upload presignado: verifica que el objeto
// ya esté en Filebase, obtiene su CID y crea el bin con su expiración.
export async function POST(context: APIContext): Promise<Response> {
  try {
    const body = await context.request.json().catch(() => null);
    const uploadToken = typeof body?.uploadToken === 'string' ? body.uploadToken : '';
    const sha256 = typeof body?.sha256 === 'string' ? (body.sha256 as string).trim().toLowerCase() : '';

    if (!uploadToken || !/^[0-9a-f]{64}$/i.test(sha256)) {
      return jsonResponse({ error: 'Invalid uploadToken or sha256' }, 400);
    }

    const tokenHash = createHash('sha256').update(uploadToken).digest('hex');
    const pending = await findPendingByToken(tokenHash);
    if (!pending) {
      return jsonResponse({ error: 'Unknown upload token' }, 404);
    }
    if (new Date(pending.presign_expires_at).getTime() <= Date.now()) {
      await deletePendingByToken(tokenHash);
      return jsonResponse({ error: 'Upload token expired' }, 410);
    }
    if (pending.sha256 !== sha256) {
      return jsonResponse({ error: 'sha256 does not match the pending upload' }, 400);
    }

    let info;
    try {
      info = await getObjectInfo(sha256);
    } catch {
      await deletePendingByToken(tokenHash);
      return jsonResponse({ error: 'Object not uploaded yet' }, 404);
    }
    if (info.size !== null && info.size !== pending.size) {
      await deletePendingByToken(tokenHash);
      return jsonResponse({ error: 'Object size does not match the declared size' }, 409);
    }
    if (!info.cid) {
      return jsonResponse({ error: 'Could not get the CID from Filebase' }, 502);
    }

    // Dedup: si otro bin público y vigente ya tiene el mismo contenido, se
    // devuelve ese en lugar de crear un registro duplicado.
    const existing = await findByHash(sha256);
    if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
      await deletePendingByToken(tokenHash);
      const downloadUrl = await createPresignedGetUrl(sha256);
      return jsonResponse({
        slug: existing.slug,
        cid: existing.cid,
        filename: existing.filename,
        mime: existing.mime,
        size: Number(existing.size),
        url: `${getPublicURL(context.request)}/f/${existing.slug}`,
        directUrl: `https://ipfs.filebase.io/ipfs/${existing.cid}`,
        downloadUrl,
        expiresAt: existing.expires_at,
      }, 200);
    }

    const slug = await generateUniqueSlug();
    const record = await insertFile({
      slug,
      sha256,
      cid: info.cid,
      filename: pending.filename,
      mime: pending.mime,
      size: pending.size,
      author: null,
      password_hash: null,
      expires_at: pending.expires_at,
      view_once: false,
      author_token: null,
      forked_from: null,
      curator_id: null,
      language: null,
      score: 0,
      report_count: 0,
      hidden: false,
      is_public: true,
    });
    await deletePendingByToken(tokenHash);

    const downloadUrl = await createPresignedGetUrl(sha256);
    return jsonResponse({
      slug: record.slug,
      cid: record.cid,
      filename: record.filename,
      mime: record.mime,
      size: Number(record.size),
      url: `${getPublicURL(context.request)}/f/${record.slug}`,
      directUrl: `https://ipfs.filebase.io/ipfs/${record.cid}`,
      downloadUrl,
      expiresAt: record.expires_at,
    }, 200);
  } catch (error: unknown) {
    console.error('Confirm error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
