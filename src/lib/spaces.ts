import { getPool, ensureSchema } from './db';
import { broadcastToSpace } from './spaces-broadcast';

export interface SpaceRecord {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SpaceMessageRecord {
  id: number;
  space_name: string;
  message: string;
  title: string | null;
  priority: number;
  tags: string | null;
  created_at: string;
}

export interface SpaceSubscriptionRecord {
  id: number;
  space_name: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface PublishInput {
  message: string;
  title?: string | null;
  priority?: number;
  tags?: string | null;
}

const MAX_MESSAGE_LENGTH = 4096;
const MAX_STORED_MESSAGES = 100;
const MESSAGE_TTL_HOURS = 24;
const SPACE_INACTIVITY_DAYS = 90;

const SPACE_NAME_RE = /^[a-zA-Z0-9_-]{3,64}$/;

export function validateSpaceName(name: string): boolean {
  return SPACE_NAME_RE.test(name);
}

export async function getOrCreateSpace(name: string): Promise<SpaceRecord> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.sql<SpaceRecord>`SELECT * FROM spaces WHERE name = ${name} LIMIT 1`;
  if (rows[0]) return rows[0];
  const { rows: inserted } = await pool.sql<SpaceRecord>`
    INSERT INTO spaces (name) VALUES (${name}) RETURNING *
  `;
  if (!inserted[0]) throw new Error('Could not create space');
  return inserted[0];
}

export async function publishToSpace(name: string, input: PublishInput): Promise<SpaceMessageRecord> {
  await cleanupInactiveSpaces();
  const space = await getOrCreateSpace(name);
  const message = input.message.trim();
  if (!message) throw new Error('Message is required');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }
  const priority = [1, 2, 3, 4, 5].includes(Number(input.priority)) ? Number(input.priority) : 3;
  const tags = input.tags?.trim() || null;
  const title = input.title?.trim() || null;

  const pool = getPool();
  const { rows } = await pool.sql<SpaceMessageRecord>`
    INSERT INTO space_messages (space_name, message, title, priority, tags)
    VALUES (${space.name}, ${message}, ${title}, ${priority}, ${tags})
    RETURNING *
  `;
  const record = rows[0];
  if (!record) throw new Error('Could not publish message');

  await cleanupSpaceMessages(space.name);
  await pool.sql`UPDATE spaces SET updated_at = NOW() WHERE name = ${space.name}`;

  broadcastToSpace(space.name, record);
  return record;
}

export async function getSpaceMessages(name: string, limit = 100): Promise<SpaceMessageRecord[]> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  await cleanupInactiveSpaces();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), MAX_STORED_MESSAGES);
  const cutoff = new Date(Date.now() - MESSAGE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await getPool().sql`UPDATE spaces SET updated_at = NOW() WHERE name = ${name} AND updated_at < NOW() - INTERVAL '1 hour'`;
  const { rows } = await getPool().sql<SpaceMessageRecord>`
    SELECT * FROM space_messages
    WHERE space_name = ${name} AND created_at > ${cutoff}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows;
}

export async function cleanupInactiveSpaces(): Promise<void> {
  await ensureSchema();
  const cutoff = new Date(Date.now() - SPACE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await getPool().sql`DELETE FROM spaces WHERE updated_at < ${cutoff}`;
}

export async function cleanupSpaceMessages(name: string): Promise<void> {
  const pool = getPool();
  const cutoff = new Date(Date.now() - MESSAGE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await pool.sql`
    DELETE FROM space_messages
    WHERE id IN (
      SELECT id FROM space_messages
      WHERE space_name = ${name}
      ORDER BY created_at DESC
      OFFSET ${MAX_STORED_MESSAGES}
    )
  `;
  await pool.sql`
    DELETE FROM space_messages
    WHERE space_name = ${name} AND created_at < ${cutoff}
  `;
}

export async function getSpaceSubscriptions(name: string): Promise<SpaceSubscriptionRecord[]> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  const { rows } = await getPool().sql<SpaceSubscriptionRecord>`
    SELECT * FROM space_subscriptions WHERE space_name = ${name}
  `;
  return rows;
}

export async function subscribeToSpace(
  name: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<SpaceSubscriptionRecord> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await getOrCreateSpace(name);
  const pool = getPool();
  const { rows } = await pool.sql<SpaceSubscriptionRecord>`
    INSERT INTO space_subscriptions (space_name, endpoint, p256dh, auth)
    VALUES (${name}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    ON CONFLICT (space_name, endpoint)
    DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not subscribe');
  return rows[0];
}

export async function unsubscribeFromSpace(name: string, endpoint: string): Promise<void> {
  await ensureSchema();
  await getPool().sql`
    DELETE FROM space_subscriptions WHERE space_name = ${name} AND endpoint = ${endpoint}
  `;
}

export async function deleteSpaceMessage(name: string, id: number): Promise<void> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  await getPool().sql`
    DELETE FROM space_messages WHERE id = ${id} AND space_name = ${name}
  `;
}

export async function subscribeCuratorToSpace(curatorId: string, name: string): Promise<void> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await getOrCreateSpace(name);
  await getPool().sql`
    INSERT INTO curator_spaces (curator_id, space_name) VALUES (${curatorId}, ${name})
    ON CONFLICT (curator_id, space_name) DO NOTHING
  `;
}

export async function unsubscribeCuratorFromSpace(curatorId: string, name: string): Promise<void> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  await getPool().sql`
    DELETE FROM curator_spaces WHERE curator_id = ${curatorId} AND space_name = ${name}
  `;
}

export async function getCuratorSpaceSubscriptions(curatorId: string): Promise<string[]> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ space_name: string }>`
    SELECT space_name FROM curator_spaces WHERE curator_id = ${curatorId} ORDER BY created_at DESC
  `;
  return rows.map((r) => r.space_name);
}

export async function isCuratorSubscribedToSpace(curatorId: string, name: string): Promise<boolean> {
  if (!validateSpaceName(name)) throw new Error('Invalid space name');
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*) AS count FROM curator_spaces WHERE curator_id = ${curatorId} AND space_name = ${name}
  `;
  return Number(rows[0]?.count || 0) > 0;
}

export interface CuratorSubscription {
  type: 'space' | 'blog' | 'forum' | 'group';
  name: string;
  title: string | null;
  link: string;
}

export async function getCuratorSubscriptions(curatorId: string): Promise<CuratorSubscription[]> {
  await ensureSchema();
  const pool = getPool();

  const spaceNames = await getCuratorSpaceSubscriptions(curatorId);
  const spaceNamesCsv = spaceNames.join(',');
  const [{ rows: blogs }, { rows: forums }, { rows: groups }] = await Promise.all([
    pool.sql<{ name: string; title: string | null; notification_space: string }>`
      SELECT name, title, notification_space FROM blogs
      WHERE notification_space = ANY(string_to_array(${spaceNamesCsv}, ','))
    `,
    pool.sql<{ name: string; title: string | null; notification_space: string }>`
      SELECT name, title, notification_space FROM forums
      WHERE notification_space = ANY(string_to_array(${spaceNamesCsv}, ','))
    `,
    pool.sql<{ name: string; title: string | null }>`
      SELECT g.name, g.title
      FROM group_members gm
      JOIN groups g ON g.name = gm.group_name
      WHERE gm.curator_id = ${curatorId}
      ORDER BY gm.joined_at DESC
    `,
  ]);

  const blogBySpace = new Map(blogs.map((b) => [b.notification_space, b]));
  const forumBySpace = new Map(forums.map((f) => [f.notification_space, f]));
  const subscriptions: CuratorSubscription[] = [];

  for (const name of spaceNames) {
    const blog = blogBySpace.get(name);
    if (blog) {
      subscriptions.push({ type: 'blog', name: blog.name, title: blog.title, link: `/blog/${blog.name}` });
      continue;
    }
    const forum = forumBySpace.get(name);
    if (forum) {
      subscriptions.push({ type: 'forum', name: forum.name, title: forum.title, link: `/forum/${forum.name}` });
      continue;
    }
    subscriptions.push({ type: 'space', name, title: null, link: `/s/${name}` });
  }

  for (const g of groups) {
    subscriptions.push({ type: 'group', name: g.name, title: g.title, link: `/group/${g.name}` });
  }

  return subscriptions;
}
