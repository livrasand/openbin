import { createClient } from '@vercel/kv';

let kv: ReturnType<typeof createClient> | undefined;

function isConfigured(): boolean {
  return (
    Boolean(process.env.KV_REST_API_URL || process.env.KV_URL) &&
    Boolean(process.env.KV_REST_API_TOKEN)
  );
}

function getKv(): ReturnType<typeof createClient> {
  if (!kv) {
    const url = process.env.KV_REST_API_URL || process.env.KV_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error('Vercel KV is not configured');
    }
    kv = createClient({ url, token });
  }
  return kv;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: number;
}

export async function checkUploadRateLimit(ip: string): Promise<RateLimitResult> {
  const limit = Number(process.env.UPLOAD_RATE_LIMIT ?? '10');
  const windowSeconds = Number(process.env.UPLOAD_RATE_WINDOW ?? '3600');

  if (!isConfigured()) {
    console.warn('Vercel KV not configured; rate limiting disabled');
    return { allowed: true, remaining: limit, limit, reset: 0 };
  }

  const safeIp = ip.replace(/[^a-zA-Z0-9]/g, '-');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const key = `rate:upload:${safeIp}:${windowStart}`;

  const client = getKv();
  const current = await client.incr(key);

  if (current === 1) {
    await client.expire(key, windowSeconds);
  }

  const reset = windowStart + windowSeconds;

  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
    limit,
    reset,
  };
}
