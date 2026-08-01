import type { APIRoute } from 'astro';
import { findBySlug } from '../../../lib/db';
import { createPresignedGetUrl } from '../../../lib/filebase';
import { jsonResponse } from '../../../lib/utils';

// GET /api/download/:slug devuelve una URL firmada de S3 (soporta Range Requests
// nativamente) para descargas resilientes directas a Filebase, sin pasar la
// función serverless. La URL expira en 24 h.
export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return jsonResponse({ error: 'Not found' }, 404);

  const record = await findBySlug(slug);
  if (!record || record.password_hash || (record.expires_at && new Date(record.expires_at) <= new Date())) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  try {
    const downloadUrl = await createPresignedGetUrl(record.sha256);
    return jsonResponse({
      slug: record.slug,
      cid: record.cid,
      filename: record.filename,
      mime: record.mime,
      size: Number(record.size),
      directUrl: `https://ipfs.filebase.io/ipfs/${record.cid}`,
      downloadUrl,
      expiresAt: record.expires_at,
    }, 200);
  } catch {
    return jsonResponse({ error: 'Could not generate the download URL' }, 502);
  }
};
