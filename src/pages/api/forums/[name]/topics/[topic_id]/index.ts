import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findForumTopic, updateForumTopic, deleteForumTopic } from '@/lib/forums';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const topicId = Number(context.params.topic_id);
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Invalid topic id' }, 400);
    }
    const topic = await findForumTopic(topicId);
    if (!topic) {
      return jsonResponse({ error: 'Topic not found' }, 404);
    }
    return jsonResponse({ topic });
  } catch (error: unknown) {
    console.error('Forum topic GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function PUT(context: APIContext): Promise<Response> {
  try {
    const topicId = Number(context.params.topic_id);
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Invalid topic id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const input: { title?: string; content?: string } = {};
    if (typeof body.title === 'string') input.title = body.title.trim();
    if (typeof body.content === 'string') input.content = body.content.trim();

    if (!input.title && input.content === undefined) {
      return jsonResponse({ error: 'Title or content required' }, 400);
    }

    const topic = await updateForumTopic(topicId, input, curator.id);
    return jsonResponse({ success: true, topic });
  } catch (error: unknown) {
    console.error('Forum topic PUT error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const topicId = Number(context.params.topic_id);
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Invalid topic id' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    await deleteForumTopic(topicId, curator.id);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Forum topic DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
