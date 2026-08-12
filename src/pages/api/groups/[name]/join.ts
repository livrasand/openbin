import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../../lib/auth';
import { findGroup, getGroupMemberRole, joinGroup, validateGroupName } from '../../../../lib/groups';
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

    const existing = await getGroupMemberRole(curator.id, name);
    if (existing === 'creator' || existing === 'member') {
      return jsonResponse({ role: existing }, 200);
    }

    const role = await joinGroup(curator.id, name);
    return jsonResponse({ role });
  } catch (error: unknown) {
    console.error('Group join error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
