import type { APIRoute } from 'astro';
import { findBySlug } from '../../lib/db';
import { downloadFromFilebase } from '../../lib/filebase';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not found', { status: 404 });

  const record = await findBySlug(slug);
  if (!record || record.password_hash || (record.expires_at && new Date(record.expires_at) <= new Date())) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const body = await downloadFromFilebase(record.sha256);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': record.mime || 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="${record.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Could not load the file', { status: 502 });
  }
};
