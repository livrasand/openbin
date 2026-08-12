import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../lib/auth';
import {
  createGroupMessage,
  getGroupMemberRole,
  getGroupMessageTree,
  isGroupMember,
  validateGroupName,
} from '../../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateGroupName(name)) {
      return jsonResponse({ error: 'Invalid group name' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    const role = curator ? await getGroupMemberRole(curator.id, name) : null;
    if (role !== 'creator' && role !== 'member') {
      return jsonResponse({ error: 'Membership required' }, 403);
    }

    const messages = await getGroupMessageTree(name, curator?.id, role === 'creator');
    return jsonResponse({ messages });
  } catch (error: unknown) {
    console.error('Group messages GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateGroupName(name)) {
      return jsonResponse({ error: 'Invalid group name' }, 400);
    }

    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    if (!(await isGroupMember(curator.id, name))) {
      return jsonResponse({ error: 'Membership required' }, 403);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const parentId = typeof body.parent_id === 'number' ? body.parent_id : null;

    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const message = await createGroupMessage(name, {
      content,
      parent_id: parentId,
      curator,
    });

    return jsonResponse({ message });
  } catch (error: unknown) {
    console.error('Group message POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
