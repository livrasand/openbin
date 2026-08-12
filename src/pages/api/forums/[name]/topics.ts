import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import {
  getForumTopics,
  createForumTopic,
  findForumTopic,
  validateForumName,
} from '@/lib/forums';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const url = new URL(context.request.url);
    const categoryId = Number(url.searchParams.get('category'));
    const before = Number(url.searchParams.get('before'));
    const limit = Number(url.searchParams.get('limit'));

    const topics = await getForumTopics(
      name,
      Number.isFinite(categoryId) && categoryId > 0 ? categoryId : undefined,
      Number.isFinite(before) && before > 0 ? before : undefined,
      Number.isFinite(limit) && limit > 0 ? limit : undefined
    );
    return jsonResponse({ topics });
  } catch (error: unknown) {
    console.error('Forum topics GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : null;
    const categoryId = Number(body.category_id);

    if (!title) return jsonResponse({ error: 'Title is required' }, 400);

    const curator = await getCurrentCurator(context.cookies);
    const topic = await createForumTopic(name, {
      title,
      content: content || undefined,
      category_id: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : undefined,
      curator,
    });
    return jsonResponse({ success: true, topic });
  } catch (error: unknown) {
    console.error('Forum topic POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function PUT(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const url = new URL(context.request.url);
    const topicId = Number(url.searchParams.get('id'));
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Topic id is required' }, 400);
    }

    const topic = await findForumTopic(topicId);
    if (!topic) {
      return jsonResponse({ error: 'Topic not found' }, 404);
    }
    return jsonResponse({ topic });
  } catch (error: unknown) {
    console.error('Forum topic GET by id error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
