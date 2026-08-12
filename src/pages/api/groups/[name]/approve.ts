import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../lib/auth';
import { approveGroupMember, findGroup, getGroupMemberRole, validateGroupName } from '../../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../../lib/utils';

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

    const group = await findGroup(name);
    if (!group) {
      return jsonResponse({ error: 'Group not found' }, 404);
    }

    const role = await getGroupMemberRole(curator.id, name);
    if (role !== 'creator') {
      return jsonResponse({ error: 'Only the creator can approve members' }, 403);
    }

    const body = (await context.request.json().catch(() => ({}))) as { target_id?: string };
    const targetId = typeof body.target_id === 'string' ? body.target_id.trim() : '';
    if (!targetId) {
      return jsonResponse({ error: 'target_id is required' }, 400);
    }

    await approveGroupMember(name, curator.id, targetId);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Group approve error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
