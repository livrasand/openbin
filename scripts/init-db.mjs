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
    sha256 CHAR(64) NOT NULL,
    cid VARCHAR(128) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(128) NOT NULL,
    size BIGINT NOT NULL,
    author VARCHAR(255),
    password_hash CHAR(64),
    expires_at TIMESTAMPTZ,
    view_once BOOLEAN DEFAULT FALSE,
    author_token CHAR(64),
    forked_from VARCHAR(12),
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

await pool.sql`ALTER TABLE files DROP CONSTRAINT IF EXISTS files_sha256_key`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author VARCHAR(255)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS password_hash CHAR(64)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS view_once BOOLEAN DEFAULT FALSE`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author_token CHAR(64)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS forked_from VARCHAR(12)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS language VARCHAR(40)`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`;
await pool.sql`UPDATE files SET report_count = COALESCE(report_count, 0), hidden = COALESCE(hidden, FALSE) WHERE report_count IS NULL OR hidden IS NULL`;
await pool.sql`ALTER TABLE files ALTER COLUMN report_count SET NOT NULL`;
await pool.sql`ALTER TABLE files ALTER COLUMN hidden SET NOT NULL`;
await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE`;
await pool.sql`UPDATE files SET is_public = TRUE WHERE is_public IS NULL`;
await pool.sql`ALTER TABLE files ALTER COLUMN is_public SET NOT NULL`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at)`;
await pool.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_files_author_token ON files(author_token)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_forked_from ON files(forked_from)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_language ON files(language)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_score ON files(score)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_report_count ON files(report_count)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_hidden ON files(hidden)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
    reporter_hash CHAR(64) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(slug, reporter_hash)
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_reports_slug ON reports(slug)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_reports_reporter_hash ON reports(reporter_hash)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS curators (
    id CHAR(16) PRIMARY KEY,
    username VARCHAR(40) UNIQUE NOT NULL,
    token_hash CHAR(64) NOT NULL,
    karma INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    username_changed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_curators_username ON curators(username)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_curators_token_hash ON curators(token_hash)`;

await pool.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_files_curator_id ON files(curator_id)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS votes (
    curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
    slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
    value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (curator_id, slug)
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_votes_slug ON votes(slug)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
    curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)`;
await pool.sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0`;
await pool.sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`;
await pool.sql`UPDATE comments SET report_count = COALESCE(report_count, 0), hidden = COALESCE(hidden, FALSE) WHERE report_count IS NULL OR hidden IS NULL`;
await pool.sql`ALTER TABLE comments ALTER COLUMN report_count SET NOT NULL`;
await pool.sql`ALTER TABLE comments ALTER COLUMN hidden SET NOT NULL`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_comments_report_count ON comments(report_count)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_comments_hidden ON comments(hidden)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS comment_reports (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, reporter_id)
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS follows (
    follower_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
    following_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS spaces (
    name VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_spaces_updated_at ON spaces(updated_at)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS space_messages (
    id BIGSERIAL PRIMARY KEY,
    space_name VARCHAR(64) NOT NULL REFERENCES spaces(name) ON DELETE CASCADE,
    message TEXT NOT NULL,
    title TEXT,
    priority SMALLINT DEFAULT 3,
    tags TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_space_messages_space_name_created_at ON space_messages(space_name, created_at DESC)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_space_messages_created_at ON space_messages(created_at)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS space_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    space_name VARCHAR(64) NOT NULL REFERENCES spaces(name) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(space_name, endpoint)
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_space_subscriptions_space_name ON space_subscriptions(space_name)`;

await pool.sql`
  CREATE TABLE IF NOT EXISTS pending_uploads (
    token_hash CHAR(64) PRIMARY KEY,
    sha256 CHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(128) NOT NULL,
    size BIGINT NOT NULL,
    expires_at TIMESTAMPTZ,
    presign_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_pending_uploads_sha256 ON pending_uploads(sha256)`;
await pool.sql`CREATE INDEX IF NOT EXISTS idx_pending_uploads_presign_expires_at ON pending_uploads(presign_expires_at)`;

console.log('Database schema ready');
process.exit(0);
