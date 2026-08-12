import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { getBlogReactions, createBlogReaction } from '@/lib/blogs';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const postId = Number(context.params.post_id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return jsonResponse({ error: 'Invalid post id' }, 400);
    }
    const reactions = await getBlogReactions(postId);
    return jsonResponse({ reactions });
  } catch (error: unknown) {
    console.error('Blog reactions GET error:', error);
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
    const type = typeof body.type === 'string' ? body.type.trim() : '';

    if (!type) return jsonResponse({ error: 'Reaction type is required' }, 400);

    const reaction = await createBlogReaction(postId, { type }, curator);
    return jsonResponse({ success: true, reaction });
  } catch (error: unknown) {
    console.error('Blog reaction POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
