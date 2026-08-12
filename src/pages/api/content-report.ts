import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { reportBlogTarget } from '@/lib/blogs';
import { reportForumTarget } from '@/lib/forums';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;
    const scope = typeof body.scope === 'string' ? body.scope.trim().toLowerCase() : '';
    const targetType = typeof body.target_type === 'string' ? body.target_type.trim() : '';
    const targetId = typeof body.target_id === 'string' ? body.target_id.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!['blog', 'forum'].includes(scope)) {
      return jsonResponse({ error: 'Invalid report scope' }, 400);
    }
    if (!targetType) return jsonResponse({ error: 'Target type is required' }, 400);
    if (!targetId) return jsonResponse({ error: 'Target id is required' }, 400);
    if (!reason) return jsonResponse({ error: 'Reason is required' }, 400);

    if (scope === 'blog') {
      await reportBlogTarget(targetType, targetId, reason);
    } else {
      await reportForumTarget(targetType, targetId, reason);
    }

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('Content report POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
