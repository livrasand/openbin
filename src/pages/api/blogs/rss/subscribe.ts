import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { subscribeBlogToRss } from '@/lib/blogs';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const feedUrl = typeof body.feed_url === 'string' ? body.feed_url.trim() : '';
    const notificationSpace = typeof body.notification_space === 'string' ? body.notification_space.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() || null : null;
    const description = typeof body.description === 'string' ? body.description.trim() || null : null;

    const result = await subscribeBlogToRss({
      name,
      feed_url: feedUrl,
      notification_space: notificationSpace,
      title,
      description,
      curator_id: curator.id,
    });

    return jsonResponse({ success: true, blog: result.blog, imported: result.imported });
  } catch (error: unknown) {
    console.error('Blog RSS subscribe error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
