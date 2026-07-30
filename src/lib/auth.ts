import { createHash, randomInt } from 'node:crypto';
import { findCuratorByTokenHash } from './db';
import type { CuratorRecord } from './db';

export const COOKIE_NAME = 'ob_curator';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export interface CookieStore {
  get(name: string): { value?: string } | undefined;
  set(
    name: string,
    value: string,
    options?: {
      path?: string;
      httpOnly?: boolean;
      maxAge?: number;
      sameSite?: 'lax';
      secure?: boolean;
    }
  ): void;
  delete(name: string, options?: { path?: string }): void;
}

export function hashCuratorCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function generateCuratorCode(): string {
  let code = '';
  for (let i = 0; i < 16; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

export function generateDefaultUsername(): string {
  const a = String(randomInt(1000, 10000));
  const b = String(randomInt(1000, 10000));
  return `anon-${a}-${b}`;
}

export function isValidUsername(username: string): boolean {
  const trimmed = username.trim();
  return /^[a-zA-Z0-9_-]{3,30}$/.test(trimmed);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function getCurrentCurator(
  cookies: CookieStore
): Promise<CuratorRecord | null> {
  const cookie = cookies.get(COOKIE_NAME);
  const code = cookie?.value;
  if (!code || !/^\d{16}$/.test(code)) {
    return null;
  }
  const tokenHash = hashCuratorCode(code);
  return findCuratorByTokenHash(tokenHash);
}

export function setCuratorCookie(cookies: CookieStore, code: string): void {
  cookies.set(COOKIE_NAME, code, {
    path: '/',
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: Boolean(import.meta.env?.PROD),
  });
}

export function clearCuratorCookie(cookies: CookieStore): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
