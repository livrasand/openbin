import type { APIContext } from 'astro';
import { jsonResponse } from '../../../lib/utils';
import { getVapidPublicKey } from '../../../lib/webpush';

export async function GET(_context: APIContext): Promise<Response> {
  const publicKey = getVapidPublicKey();
  return jsonResponse({ publicKey });
}
