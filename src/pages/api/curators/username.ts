import type { APIContext } from 'astro';
import { findCuratorByUsername, updateUsername } from '../../../lib/db';
import { getCurrentCurator, isValidUsername, normalizeUsername } from '../../../lib/auth';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (curator.username_changed) {
      return jsonResponse({ error: 'Username can only be changed once' }, 403);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      username?: string;
    };
    const requested = typeof body.username === 'string' ? body.username.trim() : '';
    const username = normalizeUsername(requested);

    if (!isValidUsername(username)) {
      return jsonResponse({ error: 'Invalid username' }, 400);
    }

    const existing = await findCuratorByUsername(username);
    if (existing && existing.id !== curator.id) {
      return jsonResponse({ error: 'Username already taken' }, 409);
    }

    const updated = await updateUsername(curator.id, username);
    if (!updated) {
      return jsonResponse({ error: 'Could not update username' }, 409);
    }

    return jsonResponse({
      username: updated.username,
      username_changed: updated.username_changed,
    });
  } catch (error: unknown) {
    console.error('Update username error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
