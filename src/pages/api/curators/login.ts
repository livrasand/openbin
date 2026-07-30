import type { APIContext } from 'astro';
import { findCuratorByTokenHash } from '../../../lib/db';
import { getErrorMessage, jsonResponse } from '../../../lib/utils';
import { hashCuratorCode, setCuratorCookie } from '../../../lib/auth';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => ({}))) as {
      code?: string;
    };

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^\d{16}$/.test(code)) {
      return jsonResponse({ error: 'Invalid account code' }, 400);
    }

    const curator = await findCuratorByTokenHash(hashCuratorCode(code));
    if (!curator) {
      return jsonResponse({ error: 'Invalid account code' }, 401);
    }

    setCuratorCookie(context.cookies, code);

    return jsonResponse({
      username: curator.username,
      karma: curator.karma,
      level: curator.level,
      username_changed: curator.username_changed,
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
