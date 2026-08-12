import {
  getPool,
  ensureSchema,
  type ForumRecord,
  type ForumCategoryRecord,
  type ForumTopicRecord,
  type ForumReplyRecord,
  type ForumReportRecord,
  type CuratorRecord,
} from './db';
import { getOrCreateSpace, publishToSpace, validateSpaceName } from './spaces';

const FORUM_NAME_RE = /^[a-zA-Z0-9_-]{3,64}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 60;
const MAX_CONTENT_LENGTH = 20000;
const MAX_CATEGORY_NAME_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 50;

export function validateForumName(name: string): boolean {
  return FORUM_NAME_RE.test(name);
}

export interface CreateForumInput {
  name: string;
  title?: string | null;
  description?: string | null;
  notification_space?: string | null;
  curator_id?: string | null;
}

export interface CreateForumCategoryInput {
  name: string;
}

export interface CreateForumTopicInput {
  title: string;
  author?: string;
  content?: string | null;
  category_id?: number | null;
  curator_id?: string | null;
  curator?: CuratorRecord | null;
}

export interface CreateForumReplyInput {
  author?: string;
  content: string;
  parent_id?: number | null;
  curator_id?: string | null;
  curator?: CuratorRecord | null;
}

export async function findForum(name: string): Promise<ForumRecord | null> {
  if (!validateForumName(name)) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<ForumRecord>`SELECT * FROM forums WHERE name = ${name} LIMIT 1`;
  return rows[0] ?? null;
}

function getDefaultForumNotificationSpace(name: string): string {
  const prefix = 'forum-';
  return name.length + prefix.length <= 64 ? `${prefix}${name}` : name;
}

export async function ensureForumNotificationSpace(name: string): Promise<ForumRecord | null> {
  if (!validateForumName(name)) return null;
  await ensureSchema();

  const forum = await findForum(name);
  if (!forum) return null;
  if (forum.notification_space) return forum;

  const defaultSpace = getDefaultForumNotificationSpace(name);
  if (!validateSpaceName(defaultSpace)) return null;
  await getOrCreateSpace(defaultSpace);

  const { rows } = await getPool().sql<ForumRecord>`
    UPDATE forums SET notification_space = ${defaultSpace} WHERE name = ${name} RETURNING *
  `;
  return rows[0] ?? null;
}

export async function getOrCreateForum(input: CreateForumInput): Promise<ForumRecord> {
  const { name, title, description, notification_space } = input;
  if (!validateForumName(name)) throw new Error('Invalid forum name');

  await ensureSchema();
  const pool = getPool();

  const { rows: existing } = await pool.sql<ForumRecord>`SELECT * FROM forums WHERE name = ${name} LIMIT 1`;
  if (existing[0]) return existing[0];

  const safeTitle = title?.trim() || null;
  const safeDescription = description?.trim() || null;
  const safeNotificationSpace = notification_space?.trim() || getDefaultForumNotificationSpace(name);
  if (!validateSpaceName(safeNotificationSpace)) throw new Error('Invalid notification space name');

  await getOrCreateSpace(safeNotificationSpace);

  const { rows: inserted } = await pool.sql<ForumRecord>`
    INSERT INTO forums (name, title, description, notification_space, curator_id)
    VALUES (${name}, ${safeTitle}, ${safeDescription}, ${safeNotificationSpace}, ${input.curator_id ?? null})
    RETURNING *
  `;
  if (!inserted[0]) throw new Error('Could not create forum');
  return inserted[0];
}

export async function getForumCategories(forumName: string): Promise<ForumCategoryRecord[]> {
  if (!validateForumName(forumName)) throw new Error('Invalid forum name');
  await ensureSchema();
  const { rows } = await getPool().sql<ForumCategoryRecord>`
    SELECT * FROM forum_categories
    WHERE forum_name = ${forumName}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function createForumCategory(
  forumName: string,
  input: CreateForumCategoryInput
): Promise<ForumCategoryRecord> {
  if (!validateForumName(forumName)) throw new Error('Invalid forum name');
  await ensureSchema();

  const name = input.name?.trim();
  if (!name) throw new Error('Category name is required');
  if (name.length > MAX_CATEGORY_NAME_LENGTH) throw new Error(`Category name too long (max ${MAX_CATEGORY_NAME_LENGTH})`);

  const pool = getPool();
  const { rows } = await pool.sql<ForumCategoryRecord>`
    INSERT INTO forum_categories (forum_name, name)
    VALUES (${forumName}, ${name})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create category');
  return rows[0];
}

export async function getForumTopics(
  forumName: string,
  categoryId?: number,
  beforeId?: number,
  limit = DEFAULT_PAGE_SIZE
): Promise<ForumTopicRecord[]> {
  if (!validateForumName(forumName)) throw new Error('Invalid forum name');
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const pool = getPool();

  if (categoryId && Number.isFinite(categoryId) && categoryId > 0) {
    if (beforeId && Number.isFinite(beforeId) && beforeId > 0) {
      const { rows } = await pool.sql<ForumTopicRecord>`
        SELECT * FROM forum_topics
        WHERE forum_name = ${forumName} AND category_id = ${categoryId} AND id < ${beforeId}
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;
      return rows;
    }
    const { rows } = await pool.sql<ForumTopicRecord>`
      SELECT * FROM forum_topics
      WHERE forum_name = ${forumName} AND category_id = ${categoryId}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows;
  }

  if (beforeId && Number.isFinite(beforeId) && beforeId > 0) {
    const { rows } = await pool.sql<ForumTopicRecord>`
      SELECT * FROM forum_topics
      WHERE forum_name = ${forumName} AND id < ${beforeId}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows;
  }

  const { rows } = await pool.sql<ForumTopicRecord>`
    SELECT * FROM forum_topics
    WHERE forum_name = ${forumName}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function findForumTopic(topicId: number): Promise<ForumTopicRecord | null> {
  if (!Number.isFinite(topicId) || topicId <= 0) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<ForumTopicRecord>`
    SELECT * FROM forum_topics WHERE id = ${topicId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createForumTopic(
  forumName: string,
  input: CreateForumTopicInput
): Promise<ForumTopicRecord> {
  if (!validateForumName(forumName)) throw new Error('Invalid forum name');
  await ensureSchema();

  const title = input.title?.trim();
  const author = input.curator ? input.curator.username : input.author?.trim();
  const content = input.content?.trim() || null;
  const categoryId = input.category_id && Number.isFinite(input.category_id) && input.category_id > 0 ? input.category_id : null;
  const curatorId = input.curator ? input.curator.id : input.curator_id ?? null;

  if (!title) throw new Error('Topic title is required');
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`Title too long (max ${MAX_TITLE_LENGTH})`);
  if (!author) throw new Error('Author is required');
  if (author.length > MAX_AUTHOR_LENGTH) throw new Error(`Author too long (max ${MAX_AUTHOR_LENGTH})`);
  if (content && content.length > MAX_CONTENT_LENGTH) throw new Error(`Content too long (max ${MAX_CONTENT_LENGTH})`);

  const forum = await ensureForumNotificationSpace(forumName);
  if (!forum) throw new Error('Forum not found');

  const pool = getPool();

  if (categoryId) {
    const { rows } = await pool.sql<{ id: number }>`
      SELECT id FROM forum_categories WHERE id = ${categoryId} AND forum_name = ${forumName} LIMIT 1
    `;
    if (!rows[0]) throw new Error('Category not found');
  }

  const { rows } = await pool.sql<ForumTopicRecord>`
    INSERT INTO forum_topics (forum_name, category_id, title, author, content, curator_id)
    VALUES (${forumName}, ${categoryId}, ${title}, ${author}, ${content}, ${curatorId})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create topic');

  await pool.sql`UPDATE forums SET updated_at = NOW() WHERE name = ${forumName}`;

  if (forum.notification_space) {
    try {
      await publishToSpace(forum.notification_space, {
        title: `New topic in /${forumName}`,
        message: title,
        tags: `forum,${forumName}`,
      });
    } catch (error) {
      console.error('Forum topic notification error:', error);
    }
  }

  return rows[0];
}

export async function getForumReplies(topicId: number): Promise<ForumReplyRecord[]> {
  if (!Number.isFinite(topicId) || topicId <= 0) throw new Error('Invalid topic id');
  await ensureSchema();
  const { rows } = await getPool().sql<ForumReplyRecord>`
    SELECT * FROM forum_replies
    WHERE topic_id = ${topicId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function createForumReply(
  topicId: number,
  input: CreateForumReplyInput
): Promise<ForumReplyRecord> {
  if (!Number.isFinite(topicId) || topicId <= 0) throw new Error('Invalid topic id');
  await ensureSchema();

  const author = input.curator ? input.curator.username : input.author?.trim();
  const content = input.content?.trim();
  const parentId = input.parent_id && Number.isFinite(input.parent_id) && input.parent_id > 0 ? input.parent_id : null;
  const curatorId = input.curator ? input.curator.id : input.curator_id ?? null;

  if (!author) throw new Error('Author is required');
  if (author.length > MAX_AUTHOR_LENGTH) throw new Error(`Author too long (max ${MAX_AUTHOR_LENGTH})`);
  if (!content) throw new Error('Content is required');
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(`Content too long (max ${MAX_CONTENT_LENGTH})`);

  const pool = getPool();

  const { rows: topic } = await pool.sql<{ id: number; forum_name: string }>`
    SELECT id, forum_name FROM forum_topics WHERE id = ${topicId} LIMIT 1
  `;
  if (!topic[0]) throw new Error('Topic not found');

  if (parentId) {
    const { rows } = await pool.sql<{ id: number }>`
      SELECT id FROM forum_replies WHERE id = ${parentId} AND topic_id = ${topicId} LIMIT 1
    `;
    if (!rows[0]) throw new Error('Parent reply not found');
  }

  const { rows } = await pool.sql<ForumReplyRecord>`
    INSERT INTO forum_replies (topic_id, parent_id, author, content, curator_id)
    VALUES (${topicId}, ${parentId}, ${author}, ${content}, ${curatorId})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create reply');

  await pool.sql`UPDATE forums SET updated_at = NOW() WHERE name = ${topic[0].forum_name}`;
  await pool.sql`UPDATE forum_topics SET updated_at = NOW() WHERE id = ${topicId}`;

  const forum = await ensureForumNotificationSpace(topic[0].forum_name);
  if (forum?.notification_space) {
    try {
      await publishToSpace(forum.notification_space, {
        title: `New reply in /${topic[0].forum_name}`,
        message: content.length > 300 ? `${content.slice(0, 300)}...` : content,
        tags: `forum,${topic[0].forum_name}`,
      });
    } catch (error) {
      console.error('Forum reply notification error:', error);
    }
  }

  return rows[0];
}

export async function findForumReplyById(replyId: number): Promise<ForumReplyRecord | null> {
  if (!Number.isFinite(replyId) || replyId <= 0) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<ForumReplyRecord>`
    SELECT * FROM forum_replies WHERE id = ${replyId} LIMIT 1
  `;
  return rows[0] ?? null;
}

function sanitizeInput(input: string, maxLength: number): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Input is required');
  if (trimmed.length > maxLength) throw new Error(`Input too long (max ${maxLength})`);
  return trimmed;
}

export interface UpdateForumTopicInput {
  title?: string;
  content?: string;
}

export async function canDeleteForumTopic(topicId: number): Promise<boolean> {
  if (!Number.isFinite(topicId) || topicId <= 0) return false;
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM forum_replies WHERE topic_id = ${topicId}
  `;
  return (rows[0]?.count ?? 0) === 0;
}

export async function updateForumTopic(
  topicId: number,
  input: UpdateForumTopicInput,
  curatorId: string
): Promise<ForumTopicRecord> {
  if (!Number.isFinite(topicId) || topicId <= 0) throw new Error('Invalid topic id');
  await ensureSchema();

  const topic = await findForumTopic(topicId);
  if (!topic) throw new Error('Topic not found');
  if (topic.curator_id !== curatorId) throw new Error('Not authorized');

  const title = input.title !== undefined ? sanitizeInput(input.title, MAX_TITLE_LENGTH) : topic.title;
  const content = input.content !== undefined ? (input.content.trim() ? sanitizeInput(input.content, MAX_CONTENT_LENGTH) : null) : topic.content;

  const { rows } = await getPool().sql<ForumTopicRecord>`
    UPDATE forum_topics
    SET title = ${title}, content = ${content}, updated_at = NOW()
    WHERE id = ${topicId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not update topic');
  return rows[0];
}

export async function deleteForumTopic(topicId: number, curatorId: string): Promise<void> {
  if (!Number.isFinite(topicId) || topicId <= 0) throw new Error('Invalid topic id');
  await ensureSchema();

  const topic = await findForumTopic(topicId);
  if (!topic) throw new Error('Topic not found');
  if (topic.curator_id !== curatorId) throw new Error('Not authorized');

  const deletable = await canDeleteForumTopic(topicId);
  if (!deletable) throw new Error('Cannot delete a topic with replies');

  await getPool().sql`DELETE FROM forum_topics WHERE id = ${topicId}`;
}

export interface UpdateForumReplyInput {
  content: string;
}

export async function updateForumReply(
  replyId: number,
  input: UpdateForumReplyInput,
  curatorId: string
): Promise<ForumReplyRecord> {
  if (!Number.isFinite(replyId) || replyId <= 0) throw new Error('Invalid reply id');
  await ensureSchema();

  const reply = await findForumReplyById(replyId);
  if (!reply) throw new Error('Reply not found');
  if (reply.curator_id !== curatorId) throw new Error('Not authorized');

  const content = sanitizeInput(input.content, MAX_CONTENT_LENGTH);

  const { rows } = await getPool().sql<ForumReplyRecord>`
    UPDATE forum_replies SET content = ${content} WHERE id = ${replyId} RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not update reply');
  return rows[0];
}

export async function deleteForumReply(replyId: number, curatorId: string): Promise<void> {
  if (!Number.isFinite(replyId) || replyId <= 0) throw new Error('Invalid reply id');
  await ensureSchema();

  const reply = await findForumReplyById(replyId);
  if (!reply) throw new Error('Reply not found');
  if (reply.curator_id !== curatorId) throw new Error('Not authorized');

  await getPool().sql`DELETE FROM forum_replies WHERE id = ${replyId}`;
}

export async function reportForumTarget(
  targetType: string,
  targetId: string,
  reason: string
): Promise<ForumReportRecord> {
  await ensureSchema();

  const safeReason = reason.trim();
  const safeTargetType = targetType.trim().toLowerCase();
  const validTypes = ['forum', 'topic', 'reply'];
  if (!validTypes.includes(safeTargetType)) throw new Error('Invalid target type');
  if (!safeReason) throw new Error('Reason is required');

  const { rows } = await getPool().sql<ForumReportRecord>`
    INSERT INTO forum_reports (target_type, target_id, reason)
    VALUES (${safeTargetType}, ${targetId}, ${safeReason})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not report');
  return rows[0];
}
