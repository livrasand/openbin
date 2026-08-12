import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { getForumCategories, createForumCategory, validateForumName } from '@/lib/forums';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }
    const categories = await getForumCategories(name);
    return jsonResponse({ categories });
  } catch (error: unknown) {
    console.error('Forum categories GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    if (!validateForumName(name)) {
      return jsonResponse({ error: 'Invalid forum name' }, 400);
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const categoryName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!categoryName) {
      return jsonResponse({ error: 'Category name is required' }, 400);
    }

    const category = await createForumCategory(name, { name: categoryName });
    return jsonResponse({ success: true, category });
  } catch (error: unknown) {
    console.error('Forum category POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
