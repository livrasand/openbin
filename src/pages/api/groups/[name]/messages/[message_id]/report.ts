import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../../../lib/auth';
import { reportGroupMessage, validateGroupName } from '../../../../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../../../../lib/utils';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const messageId = Number(context.params.message_id);
    if (!validateGroupName(name) || !Number.isFinite(messageId) || messageId <= 0) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const reporter = await getCurrentCurator(context.cookies);
    if (!reporter) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as { reason?: string };
    await reportGroupMessage(name, messageId, reporter, body.reason);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Group report error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
