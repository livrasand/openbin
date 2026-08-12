import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../../../lib/auth';
import { addOrRemoveGroupReaction, validateGroupName } from '../../../../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../../../../lib/utils';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const messageId = Number(context.params.message_id);
    if (!validateGroupName(name) || !Number.isFinite(messageId) || messageId <= 0) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as { emoji?: string };
    const emoji = typeof body.emoji === 'string' ? body.emoji : '';
    const added = await addOrRemoveGroupReaction(name, messageId, curator, emoji);
    return jsonResponse({ added });
  } catch (error: unknown) {
    console.error('Group reaction error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
