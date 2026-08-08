// JForm Email Relay API (adaptado a rutas API de Astro dentro de Openbin)
// Recibe submissions de formularios, resuelve el token en Neon y envia email via Resend
import type { APIContext } from 'astro';
import { neon } from '@neondatabase/serverless';
import * as openpgp from 'openpgp';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB por archivo
const MAX_FILES = 5; // max 5 archivos
const MAX_FIELDS = 100; // max 100 campos
const MAX_FIELD_SIZE = 256 * 1024; // 256 KB por campo

interface TokenRecord {
  email: string;
  pgp_public_key: string | null;
}

interface Attachment {
  filename: string;
  content: string;
  type: string;
}

async function resolveToken(token: string): Promise<TokenRecord | null> {
  const sql = neon(process.env.JFORM_DATABASE_URL || '');
  const rows = await sql`
        SELECT email, pgp_public_key FROM jform_tokens WHERE token = ${token} LIMIT 1
    `;
  return rows.length > 0 ? (rows[0] as TokenRecord) : null;
}

async function encryptWithPgp(plaintext: string, armoredPublicKey: string) {
  const publicKey = await openpgp.readKey({ armoredKey: armoredPublicKey });
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: plaintext }),
    encryptionKeys: publicKey,
  });
  return encrypted;
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
  const origin = new URL(context.request.url).origin;
  const headers = corsHeaders(origin);

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  // Parsear FormData (envíos del motor: /forms/[username]/[formId])
  let owner: string | null = null;
  let formTitle: string | null = null;
  const formData: Record<string, string> = {};
  const attachments: Attachment[] = [];
  let hitLimit = false;

  try {
    const form = await context.request.formData();
    let fieldCount = 0;
    for (const [name, value] of form.entries()) {
      fieldCount += 1;
      if (fieldCount > MAX_FIELDS) {
        hitLimit = true;
        break;
      }
      if (value instanceof File) {
        if (attachments.length >= MAX_FILES || value.size > MAX_FILE_SIZE) {
          hitLimit = true;
          break;
        }
        const buffer = Buffer.from(await value.arrayBuffer());
        if (value.name && buffer.length > 0) {
          attachments.push({
            filename: value.name,
            content: buffer.toString('base64'),
            type: value.type || 'application/octet-stream',
          });
          formData[name] = '[Archivo: ' + value.name + ']';
        }
      } else {
        const str = String(value);
        if (str.length > MAX_FIELD_SIZE) {
          hitLimit = true;
          break;
        }
        if (name === 'owner') owner = str;
        else if (name === 'form_title') formTitle = str;
        else formData[name] = str;
      }
    }
  } catch (e) {
    console.error('Body parse error:', e);
    return json({ error: 'Invalid request body' }, 400, headers);
  }

  if (hitLimit) {
    return json(
      { error: 'Request too large: file, field, or field count limit exceeded' },
      413,
      headers,
    );
  }

  if (!owner) {
    return json({ error: 'Owner token is required' }, 400, headers);
  }

  // Resolver token en Neon
  try {
    const record = await resolveToken(owner);

    if (!record) {
      return json({ error: 'Invalid owner token' }, 403, headers);
    }

    const { email, pgp_public_key } = record;

    // Token valido - enviar email
    const resendKey = process.env.JFORM_RESEND_API_KEY;

    if (resendKey) {
      let html;
      if (pgp_public_key) {
        // Cifrar el contenido con la clave pública PGP del dueño
        const plaintext = buildEmailPlaintext(
          formTitle || 'Form Submission',
          formData,
        );
        const encrypted = await encryptWithPgp(plaintext, pgp_public_key);
        html = buildEmailHtmlPgp(formTitle || 'Form Submission', encrypted);
      } else {
        html = buildEmailHtml(formTitle || 'Form Submission', formData);
      }

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + resendKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.JFORM_RESEND_FROM || 'JForm <onboarding@resend.dev>',
          to: email,
          subject: formTitle || 'Nueva submission de JForm',
          html: html,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Resend error:', resp.status, errText);
        return json({ error: 'Failed to send email' }, 500, headers);
      }
    } else {
      // Modo desarrollo - log
      console.log('[JFORM RELAY] JFORM_RESEND_API_KEY no configurado.', {
        to: email,
        data: formData,
      });
    }

    return json(
      {
        status: 'success',
        message: 'Form data sent. The owner will receive it via email.',
      },
      200,
      headers,
    );
  } catch (err) {
    console.error('JForm relay error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500,
      headers,
    );
  }
}

// Helper: construir HTML del email
export function buildEmailHtml(title: string, data: Record<string, string>): string {
  var rows = '';
  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      var val = data[key];
      if (typeof val === 'string' && val.length > 500) {
        val = val.substring(0, 500) + '... [truncated]';
      }
      rows +=
        '<tr><td style="padding:10px 14px;border:1px solid #e6dede;font-weight:600;background:#f8f4f4;vertical-align:top;white-space:nowrap;color:#1c1414">' +
        esc(key) +
        '</td><td style="padding:10px 14px;border:1px solid #e6dede;color:#6b6060">' +
        esc(val) +
        '</td></tr>';
    }
  }

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#fffafa;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">' +
    '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid #e6dede;overflow:hidden">' +
    '<div style="padding:32px;background:linear-gradient(135deg,#5b8def,#4a7ad5);text-align:center">' +
    '<div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.2);font-size:1.2rem;font-weight:800;color:#fff;margin-bottom:8px">J</div>' +
    '<h1 style="margin:0;color:#fff;font-size:1.2rem;font-weight:600">' +
    esc(title) +
    '</h1>' +
    '</div>' +
    '<div style="padding:32px">' +
    '<p style="color:#6b6060;font-size:0.9rem;margin:0 0 20px">Recibiste una nueva submission desde JForm:</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:0.85rem">' +
    rows +
    '</table>' +
    '</div>' +
    '<div style="padding:16px 32px;border-top:1px solid #e6dede;text-align:center">' +
    '<p style="margin:0;font-size:0.75rem;color:#a09898">Enviado por <strong style="color:#6b6060">JForm</strong> &mdash; Formularios descentralizados y privados</p>' +
    '</div>' +
    '</div></body></html>'
  );
}

export function esc(s: string): string {
  return typeof s !== 'string'
    ? '' + s
    : s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Construir texto plano para cifrar con PGP
export function buildEmailPlaintext(title: string, data: Record<string, string>): string {
  var lines = [title, '---'];
  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      var val = data[key];
      if (typeof val === 'string' && val.length > 500) {
        val = val.substring(0, 500) + '... [truncated]';
      }
      lines.push(key + ': ' + val);
    }
  }
  lines.push('---');
  lines.push('Sent via JForm email relay (PGP encrypted)');
  return lines.join('\n');
}

// Email HTML para mensajes cifrados con PGP
export function buildEmailHtmlPgp(title: string, encryptedBlock: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#fffafa;font-family:monospace">' +
    '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid #e6dede;overflow:hidden">' +
    '<div style="padding:32px;background:linear-gradient(135deg,#5b8def,#4a7ad5);text-align:center">' +
    '<div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.2);font-size:1.2rem;font-weight:800;color:#fff;margin-bottom:8px">J</div>' +
    '<h1 style="margin:0;color:#fff;font-size:1.2rem;font-weight:600">' +
    esc(title) +
    ' (PGP)' +
    '</h1>' +
    '</div>' +
    '<div style="padding:32px">' +
    '<p style="color:#6b6060;font-size:0.85rem;margin:0 0 16px">Este mensaje está cifrado con tu clave PGP pública. Descífralo con tu clave privada.</p>' +
    '<pre style="background:#f4f4f8;border:1px solid #ddd;border-radius:8px;padding:16px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;color:#333">' +
    esc(encryptedBlock) +
    '</pre>' +
    '</div>' +
    '<div style="padding:16px 32px;border-top:1px solid #e6dede;text-align:center">' +
    '<p style="margin:0;font-size:0.75rem;color:#a09898">Enviado por <strong style="color:#6b6060">JForm</strong> &mdash; Cifrado end-to-end con OpenPGP</p>' +
    '</div>' +
    '</div></body></html>'
  );
}
