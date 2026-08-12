import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findBlogCommentById, updateBlogComment, deleteBlogComment } from '@/lib/blogs';

export async function PUT(context: APIContext): Promise<Response> {
  try {
    const commentId = Number(context.params.comment_id);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return jsonResponse({ error: 'Invalid comment id' }, 400);
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

    const comment = await updateBlogComment(commentId, { content }, curator.id);
    return jsonResponse({ success: true, comment });
  } catch (error: unknown) {
    console.error('Blog comment PUT error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const commentId = Number(context.params.comment_id);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return jsonResponse({ error: 'Invalid comment id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    await deleteBlogComment(commentId, curator.id);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Blog comment DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
