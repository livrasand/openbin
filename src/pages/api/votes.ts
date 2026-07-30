import type { APIContext } from 'astro';
import { findBySlug, getVote, getVoteSummary, setVote } from '../../lib/db';
import { getCurrentCurator } from '../../lib/auth';
import { getErrorMessage, jsonResponse } from '../../lib/utils';

export async function GET(context: APIContext): Promise<Response> {
  try {
    const slug = context.url.searchParams.get('slug');
    if (!slug || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const file = await findBySlug(slug);
    if (!file) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const summary = await getVoteSummary(slug);
    const curator = await getCurrentCurator(context.cookies);
    const vote = curator ? await getVote(curator.id, slug) : null;

    return jsonResponse({
      score: summary.score,
      likes: summary.likes,
      dislikes: summary.dislikes,
      value: vote?.value ?? null,
    });
  } catch (error: unknown) {
    console.error('Vote GET error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const curator = await getCurrentCurator(context.cookies);
    if (!curator) {
      return jsonResponse({ error: 'Login required to vote' }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      slug?: string;
      value?: unknown;
    };

    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const value = typeof body.value === 'number' ? body.value : Number(body.value);

    if (slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }
    if (![1, -1].includes(value)) {
      return jsonResponse({ error: 'Vote value must be 1 or -1' }, 400);
    }

    const file = await findBySlug(slug);
    if (!file) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const result = await setVote(curator.id, slug, value);

    return jsonResponse({
      score: result.score,
      value: result.vote.value,
    });
  } catch (error: unknown) {
    console.error('Vote POST error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
