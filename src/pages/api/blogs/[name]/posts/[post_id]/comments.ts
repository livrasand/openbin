import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { getBlogComments, createBlogComment } from '@/lib/blogs';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const postId = Number(context.params.post_id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return jsonResponse({ error: 'Invalid post id' }, 400);
    }
    const comments = await getBlogComments(postId);
    return jsonResponse({ comments });
  } catch (error: unknown) {
    console.error('Blog comments GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const postId = Number(context.params.post_id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return jsonResponse({ error: 'Invalid post id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!content) return jsonResponse({ error: 'Content is required' }, 400);

    const comment = await createBlogComment(postId, { content }, curator);
    return jsonResponse({ success: true, comment });
  } catch (error: unknown) {
    console.error('Blog comment POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
