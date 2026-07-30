import type { APIContext } from 'astro';
import {
  countPublicBinsByCurator,
  findCuratorByUsername,
  getFollowCounts,
  getPublicBinsByCurator,
} from '../../../lib/db';
import { getCurrentCurator } from '../../../lib/auth';
import { isFollowing } from '../../../lib/db';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const username = context.params.username;
    if (typeof username !== 'string' || username.length === 0) {
      return jsonResponse({ error: 'Invalid username' }, 400);
    }

    const curator = await findCuratorByUsername(username);
    if (!curator) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const [counts, bins, current] = await Promise.all([
      getFollowCounts(curator.id),
      getPublicBinsByCurator(curator.id, 50),
      getCurrentCurator(context.cookies),
    ]);

    const following =
      current && current.id !== curator.id
        ? await isFollowing(current.id, curator.id)
        : false;

    return jsonResponse({
      username: curator.username,
      karma: curator.karma,
      level: curator.level,
      binCount: await countPublicBinsByCurator(curator.id),
      followers: counts.followers,
      following: counts.following,
      isFollowing: following,
      bins: bins.map((file) => ({
        slug: file.slug,
        filename: file.filename,
        language: file.language,
        score: file.score,
        size: Number(file.size),
        createdAt: file.created_at,
      })),
    });
  } catch (error: unknown) {
    console.error('Profile load error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
