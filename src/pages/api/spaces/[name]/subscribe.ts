import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/utils';
import { subscribeToSpace, unsubscribeFromSpace, validateSpaceName } from '../../../../lib/spaces';

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function isValidSubscription(input: unknown): input is PushSubscriptionInput {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  if (typeof obj.endpoint !== 'string') return false;
  if (typeof obj.keys !== 'object' || obj.keys === null) return false;
  const keys = obj.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== 'string') return false;
  if (typeof keys.auth !== 'string') return false;
  return true;
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateSpaceName(name)) {
      return jsonResponse({ error: 'Invalid space name' }, 400);
    }

    const body = await context.request.json();
    if (!isValidSubscription(body)) {
      return jsonResponse({ error: 'Invalid subscription' }, 400);
    }

    const subscription = await subscribeToSpace(name, body);
    return jsonResponse({ success: true, subscription });
  } catch (error: unknown) {
    console.error('Space subscribe error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateSpaceName(name)) {
      return jsonResponse({ error: 'Invalid space name' }, 400);
    }

    const body = await context.request.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
    if (!endpoint) {
      return jsonResponse({ error: 'Endpoint is required' }, 400);
    }

    await unsubscribeFromSpace(name, endpoint);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Space unsubscribe error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
