import type { APIContext } from 'astro';
import { findBySlug } from '../../../lib/db';
import { getPublicURL, jsonResponse } from '../../../lib/utils';

export async function GET({ params, request }: APIContext): Promise<Response> {
  const slug = params.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return jsonResponse({ error: 'Invalid slug' }, 400);
  }

  const record = await findBySlug(slug);
  if (!record) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const base = getPublicURL(request);

  return jsonResponse({
    slug: record.slug,
    sha256: record.sha256,
    cid: record.cid,
    filename: record.filename,
    mime: record.mime,
    size: Number(record.size),
    author: record.author,
    hasPassword: !!record.password_hash,
    expiresAt: record.expires_at,
    url: `${base}/f/${record.slug}`,
    directUrl: `https://ipfs.filebase.io/ipfs/${record.cid}`,
    createdAt: record.created_at,
  });
}
