import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../lib/auth';
import { findGroup, getGroupMembers, getGroupMemberRole, getOrCreateGroup, validateGroupName, type CreateGroupInput } from '../../../lib/groups';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateGroupName(name)) {
      return jsonResponse({ error: 'Invalid group name' }, 400);
    }

    const group = await findGroup(name);
    if (!group) {
      return jsonResponse({ error: 'Group not found' }, 404);
    }

    const curator = await getCurrentCurator(context.cookies);
    const role = curator ? await getGroupMemberRole(curator.id, name) : null;

    let members: Awaited<ReturnType<typeof getGroupMembers>> | undefined;
    if (role === 'creator' || role === 'member' || group.access === 'open') {
      members = await getGroupMembers(name);
    }

    return jsonResponse({ group, role, members });
  } catch (error: unknown) {
    console.error('Group GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const name = context.params.name ?? '';
    if (!validateGroupName(name)) {
      return jsonResponse({ error: 'Invalid group name' }, 400);
    }

    const body = (await context.request.json().catch(() => ({}))) as Partial<CreateGroupInput>;
    const group = await getOrCreateGroup({
      name,
      title: typeof body.title === 'string' ? body.title : null,
      description: typeof body.description === 'string' ? body.description : null,
      access: body.access === 'moderated' ? 'moderated' : 'open',
      notification_space: typeof body.notification_space === 'string' ? body.notification_space : null,
      curator_id: curator.id,
    });

    return jsonResponse({ group });
  } catch (error: unknown) {
    console.error('Group POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
