import type { APIContext } from 'astro';
import { jsonResponse, getErrorMessage } from '@/lib/utils';
import { create2FAChallenge } from '@/lib/blogs';

export async function POST(context: APIContext): Promise<Response> {
  try {
    const name = context.params.name ?? '';
    const result = await create2FAChallenge(name);
    return jsonResponse({ success: true, code: result.code });
  } catch (error: unknown) {
    console.error('Blog 2FA challenge error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
