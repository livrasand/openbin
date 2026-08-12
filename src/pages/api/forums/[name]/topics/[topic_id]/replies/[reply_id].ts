import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findForumReplyById, updateForumReply, deleteForumReply } from '@/lib/forums';

export async function PUT(context: APIContext): Promise<Response> {
  try {
    const replyId = Number(context.params.reply_id);
    if (!Number.isFinite(replyId) || replyId <= 0) {
      return jsonResponse({ error: 'Invalid reply id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const reply = await updateForumReply(replyId, { content }, curator.id);
    return jsonResponse({ success: true, reply });
  } catch (error: unknown) {
    console.error('Forum reply PUT error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const replyId = Number(context.params.reply_id);
    if (!Number.isFinite(replyId) || replyId <= 0) {
      return jsonResponse({ error: 'Invalid reply id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    await deleteForumReply(replyId, curator.id);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Forum reply DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
