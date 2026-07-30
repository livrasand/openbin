import type { APIContext } from 'astro';
import { getCurrentCurator } from '../../../lib/auth';
import {
  getCuratorSpaceSubscriptions,
  subscribeCuratorToSpace,
  unsubscribeCuratorFromSpace,
} from '../../../lib/spaces';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }
    const spaces = await getCuratorSpaceSubscriptions(curator.id);
    return jsonResponse({ spaces });
  } catch (error: unknown) {
    console.error('Curator spaces GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as { name?: string };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return jsonResponse({ error: 'Space name required' }, 400);
    }

    await subscribeCuratorToSpace(curator.id, name);
    const spaces = await getCuratorSpaceSubscriptions(curator.id);
    return jsonResponse({ spaces });
  } catch (error: unknown) {
    console.error('Curator spaces POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as { name?: string };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return jsonResponse({ error: 'Space name required' }, 400);
    }

    await unsubscribeCuratorFromSpace(curator.id, name);
    const spaces = await getCuratorSpaceSubscriptions(curator.id);
    return jsonResponse({ spaces });
  } catch (error: unknown) {
    console.error('Curator spaces DELETE error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
