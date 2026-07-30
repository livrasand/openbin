import type { APIContext } from 'astro';
import { findCuratorByUsername, getFollowCounts, toggleFollow } from '../../lib/db';
import { getCurrentCurator } from '../../lib/auth';
import { getErrorMessage, jsonResponse } from '../../lib/utils';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required to follow' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      username?: string;
    };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (username.length === 0) {
      return jsonResponse({ error: 'Invalid username' }, 400);
    }

    const target = await findCuratorByUsername(username);
    if (!target) {
      return jsonResponse({ error: 'User not found' }, 404);
    }
    if (target.id === curator.id) {
      return jsonResponse({ error: 'You cannot follow yourself' }, 400);
    }

    const result = await toggleFollow(curator.id, target.id);
    const counts = await getFollowCounts(target.id);

    return jsonResponse({
      following: result.following,
      followers: counts.followers,
    });
  } catch (error: unknown) {
    console.error('Follow error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
