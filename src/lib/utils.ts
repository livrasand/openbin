export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }

  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();

  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  return '127.0.0.1';
}

export function getPublicURL(request: Request): string {
  const host = request.headers.get('host') ?? 'openbin.livrasand.com';
  const isLocalhost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const envUrl = process.env.PUBLIC_APP_URL;
  if (envUrl && !isLocalhost) return envUrl.replace(/\/$/, '');
  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${protocol}://${host}`;
}

export function getUploadMaxSize(): number {
  return Number(process.env.UPLOAD_MAX_SIZE ?? '5242880');
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function jsonResponse(data: unknown, status = 200, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    status,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
