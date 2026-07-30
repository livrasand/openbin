import type { APIContext } from 'astro';
import { createCommentReport, getPool } from '../../../lib/db';
import { getCurrentCurator } from '../../../lib/auth';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required to report' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      comment_id?: unknown;
      reason?: string;
      details?: string;
    };

    const commentId =
      body.comment_id === null || body.comment_id === undefined
        ? null
        : Number(body.comment_id);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim() : '';

    if (commentId === null || !Number.isFinite(commentId)) {
      return jsonResponse({ error: 'Invalid comment' }, 400);
    }

    const { rows } = await getPool().sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM comments WHERE id = ${commentId}
    `;
    if ((rows[0]?.count ?? 0) === 0) {
      return jsonResponse({ error: 'Comment not found' }, 404);
    }

    const { rows: existing } = await getPool().sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM comment_reports
      WHERE comment_id = ${commentId} AND reporter_id = ${curator.id}
    `;
    if ((existing[0]?.count ?? 0) > 0) {
      return jsonResponse({ error: 'You have already reported this comment' }, 409);
    }

    const fullReason = [reason, details].filter(Boolean).join(' — ') || null;

    const { reportCount, hidden } = await createCommentReport(commentId, curator.id, fullReason);

    return jsonResponse({ success: true, reportCount, hidden }, 200);
  } catch (error: unknown) {
    console.error('Comment report error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
