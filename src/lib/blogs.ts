import {
  getPool,
  ensureSchema,
  type BlogRecord,
  type BlogPostRecord,
  type Blog2FAChallengeRecord,
  type BlogCommentRecord,
  type BlogReactionRecord,
  type BlogReportRecord,
  type CuratorRecord,
} from './db';
import { getOrCreateSpace, publishToSpace, validateSpaceName } from './spaces';
import { randomBytes } from 'node:crypto';

const BLOG_NAME_RE = /^[a-zA-Z0-9_-]{3,64}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 60;
const MAX_CONTENT_LENGTH = 50000;
const MAX_2FA_AGE_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;

export function validateBlogName(name: string): boolean {
  return BLOG_NAME_RE.test(name);
}

export interface CreateBlogInput {
  name: string;
  notification_space: string;
  title?: string | null;
  description?: string | null;
  curator_id?: string | null;
}

export interface CreateBlogPostInput {
  title: string;
  author: string;
  content: string;
  code: string;
  curator_id?: string | null;
}

export async function findBlog(name: string): Promise<BlogRecord | null> {
  if (!validateBlogName(name)) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<BlogRecord>`SELECT * FROM blogs WHERE name = ${name} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getOrCreateBlog(input: CreateBlogInput): Promise<BlogRecord> {
  const { name, notification_space, title, description } = input;
  if (!validateBlogName(name)) throw new Error('Invalid blog name');
  if (!validateSpaceName(notification_space)) throw new Error('Invalid notification space name');

  await ensureSchema();
  const pool = getPool();

  const { rows: existing } = await pool.sql<BlogRecord>`SELECT * FROM blogs WHERE name = ${name} LIMIT 1`;
  if (existing[0]) return existing[0];

  await getOrCreateSpace(notification_space);

  const safeTitle = title?.trim() || null;
  const safeDescription = description?.trim() || null;

  const { rows: inserted } = await pool.sql<BlogRecord>`
    INSERT INTO blogs (name, notification_space, title, description, curator_id)
    VALUES (${name}, ${notification_space}, ${safeTitle}, ${safeDescription}, ${input.curator_id ?? null})
    RETURNING *
  `;
  if (!inserted[0]) throw new Error('Could not create blog');
  return inserted[0];
}

export async function getBlogPosts(name: string, beforeId?: number, limit = DEFAULT_PAGE_SIZE): Promise<BlogPostRecord[]> {
  if (!validateBlogName(name)) throw new Error('Invalid blog name');
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);

  const pool = getPool();
  if (beforeId && Number.isFinite(beforeId) && beforeId > 0) {
    const { rows } = await pool.sql<BlogPostRecord>`
      SELECT * FROM blog_posts
      WHERE blog_name = ${name} AND id < ${beforeId}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows;
  }

  const { rows } = await pool.sql<BlogPostRecord>`
    SELECT * FROM blog_posts
    WHERE blog_name = ${name}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

function generate2FACode(): string {
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

export async function create2FAChallenge(blogName: string): Promise<{ code: string }> {
  if (!validateBlogName(blogName)) throw new Error('Invalid blog name');
  await ensureSchema();

  const blog = await findBlog(blogName);
  if (!blog) throw new Error('Blog not found');

  const code = generate2FACode();
  const pool = getPool();
  const { rows } = await pool.sql<Blog2FAChallengeRecord>`
    INSERT INTO blog_2fa_challenges (blog_name, code)
    VALUES (${blogName}, ${code})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create 2FA challenge');

  await publishToSpace(blog.notification_space, {
    title: '2FA code',
    message: code,
    priority: 5,
    tags: `blog,${blogName}`,
  });

  return { code };
}

export async function verify2FAChallenge(blogName: string, code: string): Promise<boolean> {
  if (!validateBlogName(blogName)) throw new Error('Invalid blog name');
  await ensureSchema();

  const cutoff = new Date(Date.now() - MAX_2FA_AGE_MS).toISOString();
  const pool = getPool();

  const { rows } = await pool.sql<Blog2FAChallengeRecord>`
    SELECT * FROM blog_2fa_challenges
    WHERE blog_name = ${blogName} AND code = ${code} AND used = FALSE AND created_at > ${cutoff}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows[0]) return false;

  await pool.sql`UPDATE blog_2fa_challenges SET used = TRUE WHERE id = ${rows[0].id}`;
  return true;
}

function sanitizeInput(input: string, maxLength: number): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Input is required');
  if (trimmed.length > maxLength) throw new Error(`Input too long (max ${maxLength})`);
  return trimmed;
}

export async function createBlogPost(
  blogName: string,
  input: CreateBlogPostInput
): Promise<BlogPostRecord> {
  if (!validateBlogName(blogName)) throw new Error('Invalid blog name');
  await ensureSchema();

  const title = sanitizeInput(input.title, MAX_TITLE_LENGTH);
  const author = sanitizeInput(input.author, MAX_AUTHOR_LENGTH);
  const content = sanitizeInput(input.content, MAX_CONTENT_LENGTH);
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('2FA code is required');

  const blog = await findBlog(blogName);
  if (!blog) throw new Error('Blog not found');

  const valid = await verify2FAChallenge(blogName, code);
  if (!valid) throw new Error('Invalid or expired 2FA code');

  const pool = getPool();
  const { rows } = await pool.sql<BlogPostRecord>`
    INSERT INTO blog_posts (blog_name, title, author, content, curator_id)
    VALUES (${blogName}, ${title}, ${author}, ${content}, ${input.curator_id ?? null})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create blog post');

  await pool.sql`UPDATE blogs SET updated_at = NOW() WHERE name = ${blogName}`;

  if (blog.notification_space) {
    try {
      await publishToSpace(blog.notification_space, {
        title: `New post in /${blogName}`,
        message: title,
        tags: `blog,${blogName}`,
      });
    } catch (error) {
      console.error('Blog post notification error:', error);
    }
  }

  return rows[0];
}

export interface CreateBlogCommentInput {
  content: string;
}

export interface CreateBlogReactionInput {
  type: string;
}

const MAX_COMMENT_CONTENT_LENGTH = 5000;

export async function getBlogComments(postId: number): Promise<BlogCommentRecord[]> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  await ensureSchema();
  const { rows } = await getPool().sql<BlogCommentRecord>`
    SELECT * FROM blog_comments
    WHERE post_id = ${postId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function createBlogComment(
  postId: number,
  input: CreateBlogCommentInput,
  curator: CuratorRecord
): Promise<BlogCommentRecord> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  if (!curator) throw new Error('Login required');
  await ensureSchema();

  const content = sanitizeInput(input.content, MAX_COMMENT_CONTENT_LENGTH);

  const pool = getPool();

  const { rows: exists } = await pool.sql<{ id: number }>`
    SELECT id FROM blog_posts WHERE id = ${postId} LIMIT 1
  `;
  if (!exists[0]) throw new Error('Post not found');

  const { rows } = await pool.sql<BlogCommentRecord>`
    INSERT INTO blog_comments (post_id, author, content, curator_id)
    VALUES (${postId}, ${curator.username}, ${content}, ${curator.id})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create comment');
  return rows[0];
}

export async function getBlogReactions(postId: number): Promise<{ type: string; count: number }[]> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  await ensureSchema();
  const { rows } = await getPool().sql<{ type: string; count: number }>`
    SELECT type, COUNT(*)::int AS count
    FROM blog_reactions
    WHERE post_id = ${postId}
    GROUP BY type
    ORDER BY type
  `;
  return rows;
}

const ALLOWED_REACTIONS = ['like', 'love', 'fire', 'rocket'];

export async function createBlogReaction(
  postId: number,
  input: CreateBlogReactionInput,
  curator: CuratorRecord
): Promise<BlogReactionRecord> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  if (!curator) throw new Error('Login required');
  await ensureSchema();

  const type = (input.type || '').trim().toLowerCase();
  if (!ALLOWED_REACTIONS.includes(type)) throw new Error('Invalid reaction type');

  const pool = getPool();

  const { rows: exists } = await pool.sql<{ id: number }>`
    SELECT id FROM blog_posts WHERE id = ${postId} LIMIT 1
  `;
  if (!exists[0]) throw new Error('Post not found');

  const { rows } = await pool.sql<BlogReactionRecord>`
    INSERT INTO blog_reactions (post_id, type, author, curator_id)
    VALUES (${postId}, ${type}, ${curator.username}, ${curator.id})
    ON CONFLICT (post_id, type, author) DO NOTHING
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Already reacted');
  return rows[0];
}

export async function findBlogPostById(postId: number): Promise<BlogPostRecord | null> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  await ensureSchema();
  const { rows } = await getPool().sql<BlogPostRecord>`
    SELECT * FROM blog_posts WHERE id = ${postId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findBlogCommentById(commentId: number): Promise<BlogCommentRecord | null> {
  if (!Number.isFinite(commentId) || commentId <= 0) throw new Error('Invalid comment id');
  await ensureSchema();
  const { rows } = await getPool().sql<BlogCommentRecord>`
    SELECT * FROM blog_comments WHERE id = ${commentId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function canDeleteBlogPost(postId: number): Promise<boolean> {
  if (!Number.isFinite(postId) || postId <= 0) return false;
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT
      (SELECT COUNT(*)::int FROM blog_comments WHERE post_id = ${postId}) +
      (SELECT COUNT(*)::int FROM blog_reactions WHERE post_id = ${postId}) AS count
  `;
  return (rows[0]?.count ?? 0) === 0;
}

export interface UpdateBlogPostInput {
  title?: string;
  content?: string;
}

export async function updateBlogPost(
  postId: number,
  input: UpdateBlogPostInput,
  curatorId: string
): Promise<BlogPostRecord> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  await ensureSchema();

  const post = await findBlogPostById(postId);
  if (!post) throw new Error('Post not found');
  if (post.curator_id !== curatorId) throw new Error('Not authorized');

  const title = input.title !== undefined ? sanitizeInput(input.title, MAX_TITLE_LENGTH) : post.title;
  const content = input.content !== undefined ? sanitizeInput(input.content, MAX_CONTENT_LENGTH) : post.content;

  const { rows } = await getPool().sql<BlogPostRecord>`
    UPDATE blog_posts SET title = ${title}, content = ${content}, updated_at = NOW()
    WHERE id = ${postId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not update post');
  return rows[0];
}

export async function deleteBlogPost(postId: number, curatorId: string): Promise<void> {
  if (!Number.isFinite(postId) || postId <= 0) throw new Error('Invalid post id');
  await ensureSchema();

  const post = await findBlogPostById(postId);
  if (!post) throw new Error('Post not found');
  if (post.curator_id !== curatorId) throw new Error('Not authorized');

  const deletable = await canDeleteBlogPost(postId);
  if (!deletable) throw new Error('Cannot delete a post with comments or reactions');

  await getPool().sql`DELETE FROM blog_posts WHERE id = ${postId}`;
}

export interface UpdateBlogCommentInput {
  content: string;
}

export async function updateBlogComment(
  commentId: number,
  input: UpdateBlogCommentInput,
  curatorId: string
): Promise<BlogCommentRecord> {
  if (!Number.isFinite(commentId) || commentId <= 0) throw new Error('Invalid comment id');
  await ensureSchema();

  const comment = await findBlogCommentById(commentId);
  if (!comment) throw new Error('Comment not found');
  if (comment.curator_id !== curatorId) throw new Error('Not authorized');

  const content = sanitizeInput(input.content, MAX_COMMENT_CONTENT_LENGTH);

  const { rows } = await getPool().sql<BlogCommentRecord>`
    UPDATE blog_comments SET content = ${content} WHERE id = ${commentId} RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not update comment');
  return rows[0];
}

export async function deleteBlogComment(commentId: number, curatorId: string): Promise<void> {
  if (!Number.isFinite(commentId) || commentId <= 0) throw new Error('Invalid comment id');
  await ensureSchema();

  const comment = await findBlogCommentById(commentId);
  if (!comment) throw new Error('Comment not found');
  if (comment.curator_id !== curatorId) throw new Error('Not authorized');

  await getPool().sql`DELETE FROM blog_comments WHERE id = ${commentId}`;
}

export async function reportBlogTarget(
  targetType: string,
  targetId: string,
  reason: string
): Promise<BlogReportRecord> {
  await ensureSchema();

  const safeReason = reason.trim();
  const safeTargetType = targetType.trim().toLowerCase();
  const validTypes = ['blog', 'post', 'comment'];
  if (!validTypes.includes(safeTargetType)) throw new Error('Invalid target type');
  if (!safeReason) throw new Error('Reason is required');

  const { rows } = await getPool().sql<BlogReportRecord>`
    INSERT INTO blog_reports (target_type, target_id, reason)
    VALUES (${safeTargetType}, ${targetId}, ${safeReason})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not report');
  return rows[0];
}
