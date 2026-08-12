import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../../lib/auth';
import {
  deleteGroupMessage,
  hideGroupMessage,
  updateGroupMessage,
  validateGroupName,
} from '../../../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../../../lib/utils';

export async function PATCH(context: APIContext): Promise<Response> {
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

    const body = (await context.request.json().catch(() => ({}))) as {
      action?: string;
      content?: string;
      reason?: string;
    };

    if (body.action === 'hide') {
      const message = await hideGroupMessage(name, messageId, curator, body.reason);
      return jsonResponse({ message });
    }

    if (body.action !== 'edit') {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    if (typeof body.content !== 'string' || !body.content.trim()) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const message = await updateGroupMessage(name, messageId, curator, body.content);
    return jsonResponse({ message });
  } catch (error: unknown) {
    console.error('Group message PATCH error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
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

    await deleteGroupMessage(name, messageId, curator);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Group message DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
