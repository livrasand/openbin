// JForm Registration API (adaptado a rutas API de Astro dentro de Openbin)
// Genera un token opaco (jf_xxxx) y lo almacena en Neon Postgres
import type { APIContext } from 'astro';
import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';

interface RegisterBody {
  email?: string;
  github?: string | null;
  pgp_public_key?: string | null;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(context: APIContext): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(new URL(context.request.url).origin),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const headers = corsHeaders(new URL(context.request.url).origin);

  const body = (await context.request.json().catch(() => null)) as RegisterBody | null;
  const email = body?.email;
  const github = body?.github || null;
  const pgp_public_key = body?.pgp_public_key || null;

  if (!email) {
    return json({ error: 'Email is required' }, 400, headers);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email format' }, 400, headers);
  }

  try {
    const sql = neon(process.env.JFORM_DATABASE_URL || '');

    // Si el email ya tiene token, devolverlo (idempotente)
    const existing = await sql`
            SELECT token FROM jform_tokens WHERE email = ${email} LIMIT 1
        `;
    if (existing.length > 0) {
      return json(
        {
          token: (existing[0] as { token: string }).token,
          email,
          github,
          pgp_enabled: !!pgp_public_key,
          message: 'Token existente recuperado.',
        },
        200,
        headers,
      );
    }

    // Generar token opaco: jf_ + 16 bytes hex
    const token = 'jf_' + randomBytes(16).toString('hex');

    await sql`
            INSERT INTO jform_tokens (token, email, github, pgp_public_key)
            VALUES (${token}, ${email}, ${github}, ${pgp_public_key})
        `;

    return json(
      {
        token,
        email,
        github,
        pgp_enabled: !!pgp_public_key,
        message:
          "Agrega este token a tu archivo .jform como 'destination_id' para usar el relay de email de JForm.",
      },
      200,
      headers,
    );
  } catch (err) {
    console.error('JForm register error:', err);
    return json({ error: 'Internal server error' }, 500, headers);
  }
}
