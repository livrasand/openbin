import type { APIContext } from 'astro';
import { validateSpaceName } from '../../../../lib/spaces';
import { subscribeToBroadcast } from '../../../../lib/spaces-broadcast';

export async function GET(context: APIContext): Promise<Response> {
  const name = context.params.name ?? '';
  if (!validateSpaceName(name)) {
    return new Response(JSON.stringify({ error: 'Invalid space name' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: connected\ndata: "ok"\n\n'));

      unsubscribe = subscribeToBroadcast(name, (message) => {
        const payload = JSON.stringify({
          id: message.id,
          message: message.message,
          title: message.title,
          priority: message.priority,
          tags: message.tags,
          created_at: message.created_at,
        });
        try {
          controller.enqueue(encoder.encode(`event: message\ndata: ${payload}\n\n`));
        } catch {
          // client disconnected
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('event: heartbeat\ndata: \n\n'));
        } catch {
          // client disconnected
        }
      }, 30000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
