import type { APIContext } from 'astro';
import { getClientIP, jsonResponse } from '../../../lib/utils';
import {
  getSpaceMessages,
  publishToSpace,
  validateSpaceName,
  type PublishInput,
  type SpaceMessageRecord,
} from '../../../lib/spaces';
import { getSpaceSubscriptions } from '../../../lib/spaces';
import { sendPushNotification } from '../../../lib/webpush';
import { checkSpaceRateLimit } from '../../../lib/ratelimit';

function getHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null && value !== '') return value;
    const lowerValue = request.headers.get(name.toLowerCase());
    if (lowerValue !== null && lowerValue !== '') return lowerValue;
  }
  return null;
}

function parseTags(raw: string | null): string | null {
  if (!raw) return null;
  const tags = raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(',');
  return tags || null;
}

async function parsePublishInput(request: Request): Promise<PublishInput> {
  const contentType = request.headers.get('content-type') || '';
  let message = '';
  let title: string | null = null;
  let priority: number | undefined;
  let tags: string | null = null;

  if (contentType.includes('application/json')) {
    const body = await request.json();
    message = typeof body.message === 'string' ? body.message : typeof body === 'string' ? body : JSON.stringify(body);
    title = typeof body.title === 'string' ? body.title : null;
    priority = typeof body.priority === 'number' ? body.priority : undefined;
    tags = typeof body.tags === 'string' ? body.tags : Array.isArray(body.tags) ? body.tags.join(',') : null;
  } else {
    message = await request.text();
    title = getHeader(request, ['Title', 'X-Title', 't']);
    const priorityHeader = getHeader(request, ['Priority', 'X-Priority', 'p', 'prio']);
    if (priorityHeader) priority = Number(priorityHeader);
    const tagsHeader = getHeader(request, ['Tags', 'X-Tags', 'ta', 'tag']);
    tags = parseTags(tagsHeader);
  }

  return { message, title, priority, tags };
}

async function sendPushToSubscribers(record: SpaceMessageRecord): Promise<void> {
  const subscriptions = await getSpaceSubscriptions(record.space_name);
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    space: record.space_name,
    message: record.message,
    title: record.title,
    priority: record.priority,
    tags: record.tags,
    time: record.created_at,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(sub.endpoint, sub.p256dh, sub.auth, payload)
    )
  );

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.error('Push failed for', subscriptions[i].endpoint, result.reason);
    }
  }
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateSpaceName(name)) {
      return jsonResponse({ error: 'Invalid space name' }, 400);
    }

    const messages = await getSpaceMessages(name);
    return jsonResponse({ name, messages });
  } catch (error: unknown) {
    console.error('Space GET error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  return handlePublish(context);
}

export async function PUT(context: APIContext): Promise<Response> {
  return handlePublish(context);
}

async function handlePublish(context: APIContext): Promise<Response> {
  try {
    const request = context.request;
    const ip = getClientIP(request);
    const rate = await checkSpaceRateLimit(ip);
    if (!rate.allowed) {
      return jsonResponse(
        { error: 'Too many messages. Please try again later.' },
        429,
        { headers: { 'X-RateLimit-Limit': String(rate.limit), 'X-RateLimit-Remaining': '0' } }
      );
    }

    const name = context.params.name ?? '';
    if (!validateSpaceName(name)) {
      return jsonResponse({ error: 'Invalid space name' }, 400);
    }

    const input = await parsePublishInput(request);
    if (!input.message.trim()) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }

    const record = await publishToSpace(name, input);

    // Fire-and-forget push notifications
    sendPushToSubscribers(record).catch((error) => {
      console.error('Push dispatch error:', error);
    });

    return jsonResponse(
      { success: true, message: record },
      200,
      {
        headers: {
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      }
    );
  } catch (error: unknown) {
    console.error('Space publish error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
