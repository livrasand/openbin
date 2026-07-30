import type { APIContext } from 'astro';
import { createComment, findBySlug, getCommentsBySlug, getPool } from '../../lib/db';
import { getCurrentCurator } from '../../lib/auth';
import { getErrorMessage, jsonResponse } from '../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const slug = context.url.searchParams.get('slug');
    if (!slug || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const comments = await getCommentsBySlug(slug);
    return jsonResponse({ comments });
  } catch (error: unknown) {
    console.error('Comments GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required to comment' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      slug?: string;
      content?: string;
      parent_id?: unknown;
    };

    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const parentId =
      body.parent_id === null || body.parent_id === undefined
        ? null
        : Number(body.parent_id);

    if (slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }
    if (content.length === 0 || content.length > 5000) {
      return jsonResponse({ error: 'Comment must be between 1 and 5000 characters' }, 400);
    }

    const file = await findBySlug(slug);
    if (!file) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    if (parentId !== null && !Number.isFinite(parentId)) {
      return jsonResponse({ error: 'Invalid parent comment' }, 400);
    }

    if (parentId !== null) {
      const { rows } = await getPool().sql<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM comments WHERE id = ${parentId} AND slug = ${slug}
      `;
      if ((rows[0]?.count ?? 0) === 0) {
        return jsonResponse({ error: 'Parent comment not found' }, 404);
      }
    }

    const comment = await createComment(slug, curator.id, content, parentId);
    return jsonResponse({ comment });
  } catch (error: unknown) {
    console.error('Comment POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
