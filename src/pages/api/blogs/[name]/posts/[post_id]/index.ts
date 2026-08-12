import type { APIContext } from 'astro';
import { marked } from 'marked';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findBlogPostById, updateBlogPost, deleteBlogPost } from '@/lib/blogs';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const postId = Number(context.params.post_id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return jsonResponse({ error: 'Invalid post id' }, 400);
    }
    const post = await findBlogPostById(postId);
    if (!post) {
      return jsonResponse({ error: 'Post not found' }, 404);
    }
    const html = await marked.parse(post.content);
    return jsonResponse({ ...post, html });
  } catch (error: unknown) {
    console.error('Blog post GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function PUT(context: APIContext): Promise<Response> {
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
    const input: { title?: string; content?: string } = {};
    if (typeof body.title === 'string') input.title = body.title.trim();
    if (typeof body.content === 'string') input.content = body.content.trim();

    if (!input.title && !input.content) {
      return jsonResponse({ error: 'Title or content required' }, 400);
    }

    const post = await updateBlogPost(postId, input, curator.id);
    return jsonResponse({ success: true, post });
  } catch (error: unknown) {
    console.error('Blog post PUT error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const postId = Number(context.params.post_id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return jsonResponse({ error: 'Invalid post id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    await deleteBlogPost(postId, curator.id);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Blog post DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
