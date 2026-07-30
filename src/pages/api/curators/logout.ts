import type { APIContext } from 'astro';
import { clearCuratorCookie } from '../../../lib/auth';

export async function POST(context: APIContext) {
  clearCuratorCookie(context.cookies);
  return context.redirect('/');
}
