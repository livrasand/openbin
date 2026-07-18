import { createPool } from '@vercel/postgres';
import type { VercelPool } from '@vercel/postgres';

if (import.meta.env?.DEV && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // Astro normally loads .env; continue if the file does not exist.
  }
}

export interface FileRecord {
  slug: string;
  sha256: string;
  cid: string;
  filename: string;
  mime: string;
  size: number;
  author: string | null;
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
}

let pool: VercelPool | undefined;
let schemaEnsured = false;

export function getPool(): VercelPool {
  if (!pool) {
    const connectionString =
      process.env.POSTGRES_URL ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_PRISMA_URL;
    if (!connectionString) {
      throw new Error('Missing POSTGRES_URL, DATABASE_URL or POSTGRES_PRISMA_URL');
    }
    pool = createPool({ connectionString });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;

  const p = getPool();
  await p.sql`
    CREATE TABLE IF NOT EXISTS files (
      slug VARCHAR(12) PRIMARY KEY,
      sha256 CHAR(64) UNIQUE NOT NULL,
      cid VARCHAR(128) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      mime VARCHAR(128) NOT NULL,
      size BIGINT NOT NULL,
      author VARCHAR(255),
      password_hash CHAR(64),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author VARCHAR(255)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS password_hash CHAR(64)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at)`;
  schemaEnsured = true;
}

export async function findByHash(sha256: string): Promise<FileRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<FileRecord>`SELECT * FROM files WHERE sha256 = ${sha256} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<FileRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<FileRecord>`SELECT * FROM files WHERE slug = ${slug} LIMIT 1`;
  return rows[0] ?? null;
}

export async function listPublicFiles(limit = 30): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT * FROM files
    WHERE password_hash IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function insertFile(
  record: Omit<FileRecord, 'created_at'>
): Promise<FileRecord> {
  await ensureSchema();
  const { rows } = await getPool().sql<FileRecord>`
    INSERT INTO files (slug, sha256, cid, filename, mime, size, author, password_hash, expires_at)
    VALUES (
      ${record.slug}, ${record.sha256}, ${record.cid}, ${record.filename}, ${record.mime}, ${record.size},
      ${record.author}, ${record.password_hash}, ${record.expires_at}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error('Could not insert the file');
  return row;
}
