import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findBlog, getOrCreateBlog, type CreateBlogInput, reportBlogTarget } from '@/lib/blogs';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const blog = await findBlog(name);
    if (!blog) {
      return jsonResponse({ error: 'Blog not found' }, 404);
    }
    return jsonResponse({ blog });
  } catch (error: unknown) {
    console.error('Blog GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const notificationSpace = typeof body.notification_space === 'string' ? body.notification_space.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : null;
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    if (!notificationSpace) {
      return jsonResponse({ error: 'Notification space is required' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);

    const input: CreateBlogInput = {
      name,
      notification_space: notificationSpace,
      title,
      description,
      curator_id: curator ? curator.id : null,
    };

    const blog = await getOrCreateBlog(input);
    return jsonResponse({ blog });
  } catch (error: unknown) {
    console.error('Blog POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
