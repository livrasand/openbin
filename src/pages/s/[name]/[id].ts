import type { APIContext } from 'astro';
import { jsonResponse } from '@/lib/utils';
import { deleteSpaceMessage, validateSpaceName } from '@/lib/spaces';

export async function DELETE(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateSpaceName(name)) {
      return jsonResponse({ error: 'Invalid space name' }, 400);
    }

    const idParam = context.params.id ?? '';
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResponse({ error: 'Invalid message id' }, 400);
    }

    await deleteSpaceMessage(name, id);
    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Space message delete error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
