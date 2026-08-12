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
  view_once: boolean;
  author_token: string | null;
  forked_from: string | null;
  curator_id: string | null;
  language: string | null;
  score: number;
  report_count: number;
  hidden: boolean;
  is_public: boolean;
  created_at: string;
}

export interface ReportRecord {
  id: number;
  slug: string;
  reporter_hash: string;
  reason: string | null;
  created_at: string;
}

export interface CuratorRecord {
  id: string;
  username: string;
  token_hash: string;
  karma: number;
  level: number;
  username_changed: boolean;
  created_at: string;
}

export interface VoteRecord {
  curator_id: string;
  slug: string;
  value: number;
  created_at: string;
}

export interface CommentRecord {
  id: number;
  slug: string;
  curator_id: string;
  parent_id: number | null;
  content: string;
  report_count: number;
  hidden: boolean;
  created_at: string;
}

export interface CommentWithAuthor extends CommentRecord {
  author: string;
  level: number;
}

export interface CommentReport {
  id: number;
  comment_id: number;
  reporter_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface FollowRecord {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface PendingUploadRecord {
  token_hash: string;
  sha256: string;
  filename: string;
  mime: string;
  size: number;
  expires_at: string | null;
  presign_expires_at: string;
  created_at: string;
}

export interface BlogRecord {
  name: string;
  notification_space: string;
  title: string | null;
  description: string | null;
  curator_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostRecord {
  id: number;
  blog_name: string;
  title: string;
  author: string;
  content: string;
  curator_id: string | null;
  created_at: string;
}

export interface Blog2FAChallengeRecord {
  id: number;
  blog_name: string;
  code: string;
  used: boolean;
  created_at: string;
}

export interface BlogCommentRecord {
  id: number;
  post_id: number;
  author: string;
  content: string;
  curator_id: string | null;
  created_at: string;
}

export interface BlogReactionRecord {
  id: number;
  post_id: number;
  type: string;
  author: string;
  curator_id: string | null;
  created_at: string;
}

export interface BlogReportRecord {
  id: number;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

export interface ForumRecord {
  name: string;
  title: string | null;
  description: string | null;
  notification_space: string | null;
  curator_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForumCategoryRecord {
  id: number;
  forum_name: string;
  name: string;
  curator_id: string | null;
  created_at: string;
}

export interface ForumTopicRecord {
  id: number;
  forum_name: string;
  category_id: number | null;
  title: string;
  author: string;
  content: string;
  curator_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForumReplyRecord {
  id: number;
  topic_id: number;
  parent_id: number | null;
  author: string;
  content: string;
  curator_id: string | null;
  created_at: string;
}

export interface ForumReportRecord {
  id: number;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

export interface GroupRecord {
  name: string;
  title: string | null;
  description: string | null;
  access: 'open' | 'moderated';
  creator_id: string;
  notification_space: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRecord {
  group_name: string;
  curator_id: string;
  role: 'creator' | 'member' | 'pending';
  joined_at: string;
}

export interface GroupMessageRecord {
  id: number;
  group_name: string;
  parent_id: number | null;
  author: string;
  content: string;
  curator_id: string | null;
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author VARCHAR(255)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS password_hash CHAR(64)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS view_once BOOLEAN DEFAULT FALSE`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS author_token CHAR(64)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS forked_from VARCHAR(12)`;
  await p.sql`ALTER TABLE files DROP CONSTRAINT IF EXISTS files_sha256_key`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at)`;
  await p.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_files_author_token ON files(author_token)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_forked_from ON files(forked_from)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
      reporter_hash CHAR(64) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(slug, reporter_hash)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_reports_slug ON reports(slug)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_reports_reporter_hash ON reports(reporter_hash)`;

  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS language VARCHAR(40)`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`;
  await p.sql`UPDATE files SET report_count = COALESCE(report_count, 0), hidden = COALESCE(hidden, FALSE) WHERE report_count IS NULL OR hidden IS NULL`;
  await p.sql`ALTER TABLE files ALTER COLUMN report_count SET NOT NULL`;
  await p.sql`ALTER TABLE files ALTER COLUMN hidden SET NOT NULL`;
  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE`;
  await p.sql`UPDATE files SET is_public = TRUE WHERE is_public IS NULL`;
  await p.sql`ALTER TABLE files ALTER COLUMN is_public SET NOT NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_language ON files(language)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_score ON files(score)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_report_count ON files(report_count)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_hidden ON files(hidden)`;

  await p.sql`
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
  await p.sql`CREATE INDEX IF NOT EXISTS idx_curators_username ON curators(username)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_curators_token_hash ON curators(token_hash)`;

  await p.sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_files_curator_id ON files(curator_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS votes (
      curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
      value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (curator_id, slug)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_votes_slug ON votes(slug)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(12) NOT NULL REFERENCES files(slug) ON DELETE CASCADE,
      curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)`;
  await p.sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0`;
  await p.sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`;
  await p.sql`UPDATE comments SET report_count = COALESCE(report_count, 0), hidden = COALESCE(hidden, FALSE) WHERE report_count IS NULL OR hidden IS NULL`;
  await p.sql`ALTER TABLE comments ALTER COLUMN report_count SET NOT NULL`;
  await p.sql`ALTER TABLE comments ALTER COLUMN hidden SET NOT NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_comments_report_count ON comments(report_count)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_comments_hidden ON comments(hidden)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS comment_reports (
      id SERIAL PRIMARY KEY,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      reporter_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(comment_id, reporter_id)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      following_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS spaces (
      name VARCHAR(64) PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_spaces_updated_at ON spaces(updated_at)`;

  await p.sql`
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
  await p.sql`CREATE INDEX IF NOT EXISTS idx_space_messages_space_name_created_at ON space_messages(space_name, created_at DESC)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_space_messages_created_at ON space_messages(created_at)`;

  await p.sql`
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
  await p.sql`CREATE INDEX IF NOT EXISTS idx_space_subscriptions_space_name ON space_subscriptions(space_name)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS curator_spaces (
      curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      space_name VARCHAR(64) NOT NULL REFERENCES spaces(name) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (curator_id, space_name)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_curator_spaces_curator_id ON curator_spaces(curator_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blogs (
      name VARCHAR(64) PRIMARY KEY,
      notification_space VARCHAR(64) NOT NULL REFERENCES spaces(name) ON DELETE CASCADE,
      title TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE blogs ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blogs_updated_at ON blogs(updated_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id BIGSERIAL PRIMARY KEY,
      blog_name VARCHAR(64) NOT NULL REFERENCES blogs(name) ON DELETE CASCADE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_blog_name_created_at ON blog_posts(blog_name, created_at DESC)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blog_2fa_challenges (
      id BIGSERIAL PRIMARY KEY,
      blog_name VARCHAR(64) NOT NULL REFERENCES blogs(name) ON DELETE CASCADE,
      code VARCHAR(16) NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_2fa_challenges_blog_name_code ON blog_2fa_challenges(blog_name, code)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_2fa_challenges_created_at ON blog_2fa_challenges(created_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blog_comments (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE blog_comments ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_comments_created_at ON blog_comments(created_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blog_reactions (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      type VARCHAR(32) NOT NULL,
      author TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, type, author)
    )
  `;
  await p.sql`ALTER TABLE blog_reactions ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_reactions_post_id ON blog_reactions(post_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS blog_reports (
      id BIGSERIAL PRIMARY KEY,
      target_type VARCHAR(32) NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_blog_reports_target ON blog_reports(target_type, target_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS forums (
      name VARCHAR(64) PRIMARY KEY,
      title TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE forums ADD COLUMN IF NOT EXISTS notification_space VARCHAR(64) REFERENCES spaces(name) ON DELETE SET NULL`;
  await p.sql`ALTER TABLE forums ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forums_updated_at ON forums(updated_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS forum_categories (
      id BIGSERIAL PRIMARY KEY,
      forum_name VARCHAR(64) NOT NULL REFERENCES forums(name) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(forum_name, name)
    )
  `;
  await p.sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_categories_forum_name ON forum_categories(forum_name)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS forum_topics (
      id BIGSERIAL PRIMARY KEY,
      forum_name VARCHAR(64) NOT NULL REFERENCES forums(name) ON DELETE CASCADE,
      category_id BIGINT REFERENCES forum_categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_topics_forum_name_created_at ON forum_topics(forum_name, created_at DESC)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_topics_category_id_created_at ON forum_topics(category_id, created_at DESC)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS forum_replies (
      id BIGSERIAL PRIMARY KEY,
      topic_id BIGINT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
      parent_id BIGINT REFERENCES forum_replies(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_replies_topic_id ON forum_replies(topic_id)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_id ON forum_replies(parent_id)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_replies_topic_id_created_at ON forum_replies(topic_id, created_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS forum_reports (
      id BIGSERIAL PRIMARY KEY,
      target_type VARCHAR(32) NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_forum_reports_target ON forum_reports(target_type, target_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS groups (
      name VARCHAR(64) PRIMARY KEY,
      title TEXT,
      description TEXT,
      access VARCHAR(20) NOT NULL CHECK (access IN ('open', 'moderated')),
      creator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      notification_space VARCHAR(64) REFERENCES spaces(name) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_groups_creator_id ON groups(creator_id)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_groups_updated_at ON groups(updated_at)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS group_members (
      group_name VARCHAR(64) NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
      curator_id CHAR(16) NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member', 'pending')),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (group_name, curator_id)
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_group_members_curator_id ON group_members(curator_id)`;

  await p.sql`
    CREATE TABLE IF NOT EXISTS group_messages (
      id BIGSERIAL PRIMARY KEY,
      group_name VARCHAR(64) NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
      parent_id BIGINT REFERENCES group_messages(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      curator_id CHAR(16) REFERENCES curators(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_group_messages_group_name_created_at ON group_messages(group_name, created_at DESC)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_group_messages_parent_id ON group_messages(parent_id)`;

  await p.sql`
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
  await p.sql`CREATE INDEX IF NOT EXISTS idx_pending_uploads_sha256 ON pending_uploads(sha256)`;
  await p.sql`CREATE INDEX IF NOT EXISTS idx_pending_uploads_presign_expires_at ON pending_uploads(presign_expires_at)`;

  schemaEnsured = true;
}

export async function findByHash(sha256: string): Promise<FileRecord | null> {
  await ensureSchema();
  // Only reuse public records for deduplication; private uploads must create a new bin.
  const { rows } = await getPool().sql<FileRecord>`SELECT * FROM files WHERE sha256 = ${sha256} AND is_public = TRUE AND hidden = FALSE LIMIT 1`;
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
    WHERE is_public = TRUE
      AND hidden = FALSE
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
    INSERT INTO files (slug, sha256, cid, filename, mime, size, author, password_hash, expires_at, view_once, author_token, forked_from, curator_id, language, score, is_public)
    VALUES (
      ${record.slug}, ${record.sha256}, ${record.cid}, ${record.filename}, ${record.mime}, ${record.size},
      ${record.author}, ${record.password_hash}, ${record.expires_at}, ${record.view_once}, ${record.author_token}, ${record.forked_from},
      ${record.curator_id}, ${record.language}, ${record.score}, ${record.is_public}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error('Could not insert the file');
  return row;
}

export async function updateFileContent(
  slug: string,
  record: Pick<FileRecord, 'sha256' | 'cid' | 'filename' | 'mime' | 'size' | 'author' | 'language'>
): Promise<FileRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<FileRecord>`
    UPDATE files
    SET sha256 = ${record.sha256},
        cid = ${record.cid},
        filename = ${record.filename},
        mime = ${record.mime},
        size = ${record.size},
        author = ${record.author},
        language = ${record.language}
    WHERE slug = ${slug}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function deleteBySlug(slug: string): Promise<FileRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<FileRecord>`DELETE FROM files WHERE slug = ${slug} RETURNING *`;
  return rows[0] ?? null;
}

export async function hasForks(slug: string): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*)::int as count FROM files WHERE forked_from = ${slug}
  `;
  return (rows[0]?.count ?? 0) > 0;
}

export async function countByHash(sha256: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*)::int as count FROM files WHERE sha256 = ${sha256}
  `;
  return rows[0]?.count ?? 0;
}

export async function markViewed(slug: string): Promise<void> {
  await ensureSchema();
  await getPool().sql`
    UPDATE files
    SET expires_at = NOW()
    WHERE slug = ${slug} AND view_once = TRUE AND expires_at IS NULL
  `;
}

export async function createPendingUpload(
  record: Omit<PendingUploadRecord, 'created_at'>
): Promise<PendingUploadRecord> {
  await ensureSchema();
  const { rows } = await getPool().sql<PendingUploadRecord>`
    INSERT INTO pending_uploads (token_hash, sha256, filename, mime, size, expires_at, presign_expires_at)
    VALUES (
      ${record.token_hash}, ${record.sha256}, ${record.filename}, ${record.mime}, ${record.size},
      ${record.expires_at}, ${record.presign_expires_at}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error('Could not create the pending upload');
  return row;
}

export async function findPendingByToken(tokenHash: string): Promise<PendingUploadRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<PendingUploadRecord>`SELECT * FROM pending_uploads WHERE token_hash = ${tokenHash} LIMIT 1`;
  return rows[0] ?? null;
}

export async function deletePendingByToken(tokenHash: string): Promise<void> {
  await ensureSchema();
  await getPool().sql`DELETE FROM pending_uploads WHERE token_hash = ${tokenHash}`;
}

// listExpiredFiles devuelve los bins con expiración vencida para limpieza física.
export async function listExpiredFiles(limit = 100): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT * FROM files
    WHERE expires_at IS NOT NULL AND expires_at <= NOW()
    LIMIT ${safeLimit}
  `;
  return rows;
}

// deleteExpiredPending elimina los uploads pendientes cuya URL firmada ya venció.
export async function deleteExpiredPending(): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    WITH deleted AS (
      DELETE FROM pending_uploads WHERE presign_expires_at <= NOW() RETURNING 1
    )
    SELECT COUNT(*)::int as count FROM deleted
  `;
  return rows[0]?.count ?? 0;
}

export async function hasReported(slug: string, reporterHash: string): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*) AS count FROM reports WHERE slug = ${slug} AND reporter_hash = ${reporterHash}
  `;
  return Number(rows[0]?.count) > 0;
}

export async function createReport(
  slug: string,
  reporterHash: string,
  reason: string | null
): Promise<{ reportCount: number; hidden: boolean }> {
  await ensureSchema();
  const pool = getPool();

  await pool.sql`
    INSERT INTO reports (slug, reporter_hash, reason)
    VALUES (${slug}, ${reporterHash}, ${reason})
  `;

  await pool.sql`
    UPDATE files
    SET report_count = (SELECT COUNT(*)::int FROM reports WHERE slug = ${slug})
    WHERE slug = ${slug}
  `;

  const { rows } = await pool.sql<{ report_count: number; hidden: boolean; curator_id: string | null }>`
    SELECT report_count, hidden, curator_id FROM files WHERE slug = ${slug}
  `;
  const row = rows[0];
  if (row && row.report_count >= 6 && !row.hidden && row.curator_id) {
    await pool.sql`UPDATE files SET hidden = TRUE WHERE slug = ${slug}`;
    await pool.sql`UPDATE curators SET karma = GREATEST(karma - 6, 0) WHERE id = ${row.curator_id}`;
    return { reportCount: row.report_count, hidden: true };
  }

  return { reportCount: row?.report_count ?? 0, hidden: row?.hidden ?? false };
}

export async function listPublicFilesPopular(limit = 30): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT * FROM files
    WHERE is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY score DESC, created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function listPublicFilesTrending(limit = 30): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT *,
      COALESCE(score, 0) / POWER(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 + 2, 1.5) AS trending_score
    FROM files
    WHERE is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY trending_score DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function listPublicFilesByLanguage(lang: string, limit = 30): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT * FROM files
    WHERE is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
      AND language = ${lang}
    ORDER BY score DESC, created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function getDistinctLanguages(): Promise<string[]> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ language: string }>`
    SELECT DISTINCT language
    FROM files
    WHERE is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
      AND language IS NOT NULL
    ORDER BY language
  `;
  return rows.map((r) => r.language);
}

export async function findCuratorByTokenHash(tokenHash: string): Promise<CuratorRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`SELECT * FROM curators WHERE token_hash = ${tokenHash} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findCuratorById(id: string): Promise<CuratorRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`SELECT * FROM curators WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findCuratorByUsername(username: string): Promise<CuratorRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`
    SELECT * FROM curators WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createCurator(
  record: Pick<CuratorRecord, 'id' | 'username' | 'token_hash'>
): Promise<CuratorRecord> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`
    INSERT INTO curators (id, username, token_hash)
    VALUES (${record.id}, ${record.username}, ${record.token_hash})
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error('Could not create curator');
  return row;
}

export async function updateUsername(id: string, username: string): Promise<CuratorRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`
    UPDATE curators
    SET username = ${username}, username_changed = TRUE
    WHERE id = ${id} AND username_changed = FALSE
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function getPublicBinsByCurator(
  curatorId: string,
  limit = 50
): Promise<FileRecord[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const { rows } = await getPool().sql<FileRecord>`
    SELECT * FROM files
    WHERE curator_id = ${curatorId}
      AND is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function countPublicBinsByCurator(curatorId: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM files
    WHERE curator_id = ${curatorId}
      AND is_public = TRUE
      AND hidden = FALSE
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return rows[0]?.count ?? 0;
}

export async function getVote(curatorId: string, slug: string): Promise<VoteRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<VoteRecord>`
    SELECT * FROM votes WHERE curator_id = ${curatorId} AND slug = ${slug} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateFileScore(slug: string, delta: number): Promise<number | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ score: number }>`
    UPDATE files SET score = COALESCE(score, 0) + ${delta} WHERE slug = ${slug} RETURNING score
  `;
  return rows[0]?.score ?? null;
}

export async function updateCuratorKarma(curatorId: string, delta: number): Promise<CuratorRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().sql<CuratorRecord>`
    UPDATE curators
    SET karma = COALESCE(karma, 0) + ${delta},
        level = GREATEST(1, (FLOOR((COALESCE(karma, 0) + ${delta})::numeric / 10) + 1)::int)
    WHERE id = ${curatorId}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function setVote(
  curatorId: string,
  slug: string,
  value: number
): Promise<{ vote: VoteRecord; score: number; delta: number }> {
  await ensureSchema();
  const existing = await getVote(curatorId, slug);
  const { rows } = await getPool().sql<VoteRecord>`
    INSERT INTO votes (curator_id, slug, value)
    VALUES (${curatorId}, ${slug}, ${value})
    ON CONFLICT (curator_id, slug)
    DO UPDATE SET value = EXCLUDED.value, created_at = NOW()
    RETURNING *
  `;
  const vote = rows[0];
  if (!vote) throw new Error('Could not record vote');

  const oldValue = existing?.value ?? 0;
  const delta = vote.value - oldValue;

  if (delta !== 0) {
    await updateFileScore(slug, delta);
    const file = await findBySlug(slug);
    if (file?.curator_id) {
      await updateCuratorKarma(file.curator_id, delta);
    }
  }

  const updatedFile = await findBySlug(slug);
  return { vote, score: updatedFile?.score ?? 0, delta };
}

export async function getVotesByCuratorAndSlugs(
  curatorId: string,
  slugs: string[]
): Promise<Record<string, number>> {
  await ensureSchema();
  const result: Record<string, number> = {};
  if (slugs.length === 0) return result;
  const slugSet = new Set(slugs);

  const { rows } = await getPool().sql<{ slug: string; value: number }>`
    SELECT slug, value FROM votes WHERE curator_id = ${curatorId}
  `;
  for (const row of rows) {
    if (slugSet.has(row.slug)) {
      result[row.slug] = row.value;
    }
  }
  return result;
}

export async function getVoteSummary(slug: string): Promise<{ score: number; likes: number; dislikes: number }> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ score: number; likes: number; dislikes: number }>`
    SELECT
      COALESCE(SUM(value), 0)::int AS score,
      COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int AS likes,
      COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
    FROM votes
    WHERE slug = ${slug}
  `;
  const row = rows[0];
  if (!row) return { score: 0, likes: 0, dislikes: 0 };
  return { score: row.score, likes: row.likes, dislikes: row.dislikes };
}

export async function getCommentsBySlug(slug: string): Promise<CommentWithAuthor[]> {
  await ensureSchema();
  const { rows } = await getPool().sql<CommentWithAuthor>`
    SELECT c.*, cu.username AS author, cu.level
    FROM comments c
    JOIN curators cu ON c.curator_id = cu.id
    WHERE c.slug = ${slug}
    ORDER BY c.created_at ASC
  `;
  return rows;
}

export async function createComment(
  slug: string,
  curatorId: string,
  content: string,
  parentId: number | null
): Promise<CommentRecord> {
  await ensureSchema();
  const { rows } = await getPool().sql<CommentRecord>`
    INSERT INTO comments (slug, curator_id, parent_id, content)
    VALUES (${slug}, ${curatorId}, ${parentId}, ${content})
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error('Could not create comment');
  return row;
}

export async function createCommentReport(
  commentId: number,
  reporterId: string | null,
  reason: string | null
): Promise<CommentReport & { reportCount: number; hidden: boolean }> {
  await ensureSchema();
  const pool = getPool();

  const { rows: inserted } = await pool.sql<CommentReport>`
    INSERT INTO comment_reports (comment_id, reporter_id, reason)
    VALUES (${commentId}, ${reporterId}, ${reason})
    RETURNING *
  `;
  const report = inserted[0];
  if (!report) throw new Error('Could not create comment report');

  await pool.sql`
    UPDATE comments
    SET report_count = (SELECT COUNT(*)::int FROM comment_reports WHERE comment_id = ${commentId})
    WHERE id = ${commentId}
  `;

  const { rows } = await pool.sql<{ report_count: number; hidden: boolean; curator_id: string | null }>`
    SELECT report_count, hidden, curator_id FROM comments WHERE id = ${commentId}
  `;
  const row = rows[0];
  let hidden = row?.hidden ?? false;
  if (row && row.report_count >= 6 && !row.hidden && row.curator_id) {
    await pool.sql`UPDATE comments SET hidden = TRUE WHERE id = ${commentId}`;
    await pool.sql`UPDATE curators SET karma = GREATEST(karma - 6, 0) WHERE id = ${row.curator_id}`;
    hidden = true;
  }

  return { ...report, reportCount: row?.report_count ?? 0, hidden };
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM follows
    WHERE follower_id = ${followerId} AND following_id = ${followingId}
  `;
  return (rows[0]?.count ?? 0) > 0;
}

export async function getFollowCounts(curatorId: string): Promise<{ followers: number; following: number }> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ followers: number; following: number }>`
    SELECT
      (SELECT COUNT(*)::int FROM follows WHERE following_id = ${curatorId}) AS followers,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = ${curatorId}) AS following
  `;
  return rows[0] ?? { followers: 0, following: 0 };
}

export async function toggleFollow(
  followerId: string,
  followingId: string
): Promise<{ following: boolean }> {
  await ensureSchema();
  const alreadyFollowing = await isFollowing(followerId, followingId);
  if (alreadyFollowing) {
    await getPool().sql`
      DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
    `;
    return { following: false };
  }
  await getPool().sql`
    INSERT INTO follows (follower_id, following_id) VALUES (${followerId}, ${followingId})
  `;
  return { following: true };
}
