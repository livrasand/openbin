import type { APIContext } from 'astro';
import { marked } from 'marked';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { createBlogPost, getBlogPosts, validateBlogName, type CreateBlogPostInput } from '@/lib/blogs';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateBlogName(name)) {
      return jsonResponse({ error: 'Invalid blog name' }, 400);
    }

    const url = new URL(context.request.url);
    const before = Number(url.searchParams.get('before'));
    const limit = Number(url.searchParams.get('limit'));

    const messages = await getBlogPosts(
      name,
      Number.isFinite(before) && before > 0 ? before : undefined,
      Number.isFinite(limit) && limit > 0 ? limit : undefined
    );

    const rendered = await Promise.all(
      messages.map(async (post) => ({
        ...post,
        html: await marked.parse(post.content),
      }))
    );

    return jsonResponse({ name, messages: rendered });
  } catch (error: unknown) {
    console.error('Blog posts GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateBlogName(name)) {
      return jsonResponse({ error: 'Invalid blog name' }, 400);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const author = typeof body.author === 'string' ? body.author.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!title) return jsonResponse({ error: 'Title is required' }, 400);
    if (!author) return jsonResponse({ error: 'Author is required' }, 400);
    if (!content) return jsonResponse({ error: 'Content is required' }, 400);
    if (!code) return jsonResponse({ error: '2FA code is required' }, 400);

    const curator = await getCurrentCurator(context.cookies);
    const input: CreateBlogPostInput = { title, author, content, code, curator_id: curator ? curator.id : null };
    const post = await createBlogPost(name, input);
    return jsonResponse({ success: true, post });
  } catch (error: unknown) {
    console.error('Blog post POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
