import type { APIContext } from 'astro';
import { createHash, randomUUID } from 'node:crypto';
import { createReport, findBySlug, hasReported } from '../../lib/db';
import { getClientIP, getErrorMessage, jsonResponse } from '../../lib/utils';

const REPORT_COOKIE_NAME = 'ob_report_token';
const REPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function getReporterHash(token: string, ip: string): string {
  return createHash('sha256').update(`${token}:${ip}`).digest('hex');
}

function getOrCreateReportToken(cookies: APIContext['cookies']): string {
  const existing = cookies.get(REPORT_COOKIE_NAME);
  if (existing?.value) {
    return existing.value;
  }

  const token = randomUUID();
  cookies.set(REPORT_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    maxAge: REPORT_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
  });

  return token;
}

interface ReportPayload {
  slug?: string;
  reason?: string;
}

export async function POST(context: APIContext): Promise<Response> {
  try {
    const { request, cookies } = context;
    const body = (await request.json().catch(() => ({}))) as ReportPayload;
    const { slug, reason } = body;

    if (typeof slug !== 'string' || slug.length === 0) {
      return jsonResponse({ error: 'Invalid slug' }, 400);
    }

    const record = await findBySlug(slug);
    if (!record) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    const ip = getClientIP(request);
    const token = getOrCreateReportToken(cookies);
    const reporterHash = getReporterHash(token, ip);

    if (await hasReported(slug, reporterHash)) {
      return jsonResponse({ message: 'You have already reported this file' }, 409);
    }

    const normalizedReason =
      typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : null;

    const { reportCount, hidden } = await createReport(slug, reporterHash, normalizedReason);

    return jsonResponse({ message: 'Reported', reportCount, hidden }, 200);
  } catch (error: unknown) {
    console.error('Report error:', error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
