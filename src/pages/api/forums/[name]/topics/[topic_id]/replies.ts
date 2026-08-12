import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { getForumReplies, createForumReply, validateForumName } from '@/lib/forums';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const topicIdParam = context.params.topic_id ?? '';
    const topicId = Number(topicIdParam);
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Invalid topic id' }, 400);
    }

    const replies = await getForumReplies(topicId);
    return jsonResponse({ replies });
  } catch (error: unknown) {
    console.error('Forum replies GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const topicIdParam = context.params.topic_id ?? '';
    const topicId = Number(topicIdParam);
    if (!Number.isFinite(topicId) || topicId <= 0) {
      return jsonResponse({ error: 'Invalid topic id' }, 400);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const parentId = Number(body.parent_id);

    if (!content) return jsonResponse({ error: 'Content is required' }, 400);

    const curator = await getCurrentCurator(context.cookies);
    const reply = await createForumReply(topicId, {
      content,
      parent_id: Number.isFinite(parentId) && parentId > 0 ? parentId : undefined,
      curator,
    });
    return jsonResponse({ success: true, reply });
  } catch (error: unknown) {
    console.error('Forum reply POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
