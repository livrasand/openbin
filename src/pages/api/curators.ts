import type { APIContext } from 'astro';
import {
  createCurator,
  findCuratorById,
  findCuratorByUsername,
  updateUsername,
} from '../../lib/db';
import {
  generateCuratorCode,
  generateDefaultUsername,
  getCurrentCurator,
  hashCuratorCode,
  isValidUsername,
  normalizeUsername,
  setCuratorCookie,
} from '../../lib/auth';
import { jsonResponse, getErrorMessage } from '../../lib/utils';

const MAX_CODE_ATTEMPTS = 10;
const MAX_USERNAME_ATTEMPTS = 20;

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
    const code = generateCuratorCode();
    const existing = await findCuratorById(code);
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique account code');
}

async function generateUniqueUsername(preferred?: string): Promise<string> {
  if (preferred && isValidUsername(preferred)) {
    const normalized = normalizeUsername(preferred);
    const existing = await findCuratorByUsername(normalized);
    if (!existing) return normalized;
    throw new Error('Username already taken');
  }

  for (let i = 0; i < MAX_USERNAME_ATTEMPTS; i += 1) {
    const username = generateDefaultUsername();
    const existing = await findCuratorByUsername(username);
    if (!existing) return username;
  }
  throw new Error('Could not generate a unique default username');
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => ({}))) as {
      username?: string;
    };

    const code = await generateUniqueCode();
    const tokenHash = hashCuratorCode(code);
    const preferred = typeof body.username === 'string' ? body.username.trim() : '';
    const username = await generateUniqueUsername(preferred || undefined);

    const curator = await createCurator({
      id: code,
      username,
      token_hash: tokenHash,
    });

    let finalCurator: import('../../lib/db').CuratorRecord | null = curator;
    if (preferred && isValidUsername(preferred)) {
      finalCurator = await updateUsername(curator.id, curator.username);
      if (!finalCurator) {
        return jsonResponse({ error: 'Could not set username' }, 500);
      }
    }

    setCuratorCookie(context.cookies, code);

    return jsonResponse({
      code,
      username: finalCurator.username,
      karma: finalCurator.karma,
      level: finalCurator.level,
      username_changed: finalCurator.username_changed,
    });
  } catch (error: unknown) {
    console.error('Create curator error:', error);
    const message = getErrorMessage(error);
    const status = message.includes('already') || message.includes('unique') ? 409 : 500;
    return jsonResponse({ error: message }, status);
  }
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    return jsonResponse({
      username: curator.username,
      karma: curator.karma,
      level: curator.level,
      username_changed: curator.username_changed,
    });
  } catch (error: unknown) {
    console.error('Get curator error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
