import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getCurrentCurator } from '@/lib/auth';
import { findForum, getOrCreateForum, type CreateForumInput } from '@/lib/forums';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const forum = await findForum(name);
    if (!forum) {
      return jsonResponse({ error: 'Forum not found' }, 404);
    }
    return jsonResponse({ forum });
  } catch (error: unknown) {
    console.error('Forum GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : null;
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    const curator = await getCurrentCurator(context.cookies);
    const input: CreateForumInput = { name, title, description, curator_id: curator ? curator.id : null };
    const forum = await getOrCreateForum(input);
    return jsonResponse({ forum });
  } catch (error: unknown) {
    console.error('Forum POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
