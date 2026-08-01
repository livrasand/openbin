import type { APIRoute } from 'astro';
import { deleteExpiredPending, listExpiredFiles, deleteBySlug, countByHash } from '../../../lib/db';
import { deleteFromFilebase } from '../../../lib/filebase';
import { jsonResponse } from '../../../lib/utils';

// GET /api/cron/cleanup — invocado por Vercel Cron una vez al día (límite del plan Hobby). Libera los uploads
// pendientes vencidos y borra físicamente (registro + objeto S3) los bins cuya
// expiración ya pasó, sin tocar objetos que sigan referenciados por otros bins.
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
  }

  try {
    const deletedPending = await deleteExpiredPending();

    let deletedBins = 0;
    let deletedObjects = 0;
    const expired = await listExpiredFiles(100);
    for (const record of expired) {
      const removed = await deleteBySlug(record.slug);
      if (!removed) continue;
      deletedBins += 1;
      const remaining = await countByHash(removed.sha256);
      if (remaining === 0) {
        try {
          await deleteFromFilebase(removed.sha256);
          deletedObjects += 1;
        } catch {
          // El objeto puede no existir ya; la DB es la fuente de verdad.
        }
      }
    }

    return jsonResponse({ ok: true, deletedPending, deletedBins, deletedObjects }, 200);
  } catch (error: unknown) {
    console.error('Cleanup error:', error);
    return jsonResponse({ error: 'Cleanup failed' }, 500);
  }
};
