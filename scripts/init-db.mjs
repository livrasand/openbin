import { createPool } from '@vercel/postgres';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // .env does not exist or could not be loaded
  }
}

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Missing the POSTGRES_URL environment variable');
  process.exit(1);
}

const pool = createPool({ connectionString });

await pool.sql`
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

await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author VARCHAR(255)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS password_hash CHAR(64)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at)`;

console.log('Database schema ready');
process.exit(0);
