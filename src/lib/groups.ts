import {
  getPool,
  ensureSchema,
  type GroupRecord,
  type GroupMemberRecord,
  type GroupMessageRecord,
  type GroupReactionRecord,
  type GroupReportRecord,
  type CuratorRecord,
} from './db';
import { getOrCreateSpace, validateSpaceName } from './spaces';

const GROUP_NAME_RE = /^[a-zA-Z0-9_-]{3,64}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 10000;

export interface CreateGroupInput {
  name: string;
  title?: string | null;
  description?: string | null;
  access?: 'open' | 'moderated' | null;
  notification_space?: string | null;
  curator_id: string;
}

export interface CreateGroupMessageInput {
  content: string;
  parent_id?: number | null;
  curator: CuratorRecord | null;
}

export interface GroupMemberWithUser extends GroupMemberRecord {
  username: string;
}

export interface GroupReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

export type GroupMessageNode = GroupMessageRecord & {
  children: GroupMessageNode[];
  reactions: GroupReactionSummary[];
  can_edit: boolean;
  can_delete: boolean;
  is_author: boolean;
};

export interface GroupReportWithDetails extends GroupReportRecord {
  author: string;
  reporter_username: string;
  message_content: string;
}


export function validateGroupName(name: string): boolean {
  return GROUP_NAME_RE.test(name);
}

export function getDefaultGroupNotificationSpace(name: string): string {
  const prefix = 'group-';
  return name.length + prefix.length <= 64 ? `${prefix}${name}` : name;
}

export async function findGroup(name: string): Promise<GroupRecord | null> {
  if (!validateGroupName(name)) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<GroupRecord>`SELECT * FROM groups WHERE name = ${name} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getOrCreateGroup(input: CreateGroupInput): Promise<GroupRecord> {
  const { name, title, description, access, notification_space, curator_id } = input;
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  if (!curator_id) throw new Error('Creator is required');

  await ensureSchema();
  const pool = getPool();

  const { rows: existing } = await pool.sql<GroupRecord>`SELECT * FROM groups WHERE name = ${name} LIMIT 1`;
  if (existing[0]) return existing[0];

  const safeTitle = title?.trim().slice(0, MAX_TITLE_LENGTH) || null;
  const safeDescription = description?.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null;
  const safeAccess = access === 'moderated' ? 'moderated' : 'open';
  const safeNotificationSpace = notification_space?.trim() || getDefaultGroupNotificationSpace(name);
  if (!validateSpaceName(safeNotificationSpace)) throw new Error('Invalid notification space name');

  await getOrCreateSpace(safeNotificationSpace);

  const { rows: inserted } = await pool.sql<GroupRecord>`
    INSERT INTO groups (name, title, description, access, creator_id, notification_space)
    VALUES (${name}, ${safeTitle}, ${safeDescription}, ${safeAccess}, ${curator_id}, ${safeNotificationSpace})
    RETURNING *
  `;
  if (!inserted[0]) throw new Error('Could not create group');

  await pool.sql`
    INSERT INTO group_members (group_name, curator_id, role)
    VALUES (${name}, ${curator_id}, 'creator')
    ON CONFLICT (group_name, curator_id) DO NOTHING
  `;

  return inserted[0];
}

export async function getGroupMembers(name: string): Promise<GroupMemberWithUser[]> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();
  const { rows } = await getPool().sql<GroupMemberWithUser>`
    SELECT gm.group_name, gm.curator_id, gm.role, gm.joined_at, c.username
    FROM group_members gm
    JOIN curators c ON c.id = gm.curator_id
    WHERE gm.group_name = ${name}
    ORDER BY gm.joined_at ASC
  `;
  return rows;
}

export async function getGroupMemberRole(
  curatorId: string,
  name: string
): Promise<GroupMemberRecord['role'] | null> {
  if (!validateGroupName(name)) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<{ role: GroupMemberRecord['role'] }>`
    SELECT role FROM group_members WHERE group_name = ${name} AND curator_id = ${curatorId} LIMIT 1
  `;
  return rows[0]?.role ?? null;
}

export async function isGroupMember(curatorId: string, name: string): Promise<boolean> {
  const role = await getGroupMemberRole(curatorId, name);
  return role === 'creator' || role === 'member';
}

export async function joinGroup(
  curatorId: string,
  name: string
): Promise<GroupMemberRecord['role']> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();

  const group = await findGroup(name);
  if (!group) throw new Error('Group not found');

  const role = group.access === 'open' ? 'member' : 'pending';

  await getPool().sql`
    INSERT INTO group_members (group_name, curator_id, role)
    VALUES (${name}, ${curatorId}, ${role})
    ON CONFLICT (group_name, curator_id) DO UPDATE SET role = EXCLUDED.role
  `;

  return role;
}

export async function approveGroupMember(
  groupName: string,
  curatorId: string,
  targetCuratorId: string
): Promise<void> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  await ensureSchema();

  const role = await getGroupMemberRole(curatorId, groupName);
  if (role !== 'creator') throw new Error('Only the creator can approve members');

  const { rows } = await getPool().sql`
    UPDATE group_members SET role = 'member'
    WHERE group_name = ${groupName} AND curator_id = ${targetCuratorId} AND role = 'pending'
    RETURNING group_name
  `;
  if (!rows[0]) throw new Error('Pending member not found');
}

export async function leaveGroup(curatorId: string, name: string): Promise<void> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();

  const role = await getGroupMemberRole(curatorId, name);
  if (!role) return;

  if (role === 'creator') {
    await getPool().sql`DELETE FROM groups WHERE name = ${name}`;
  } else {
    await getPool().sql`DELETE FROM group_members WHERE group_name = ${name} AND curator_id = ${curatorId}`;
  }
}

export async function createGroupMessage(
  groupName: string,
  input: CreateGroupMessageInput
): Promise<GroupMessageRecord> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  await ensureSchema();

  const content = input.content?.trim();
  if (!content) throw new Error('Message content is required');
  if (content.length > MAX_MESSAGE_LENGTH) throw new Error(`Content too long (max ${MAX_MESSAGE_LENGTH})`);

  const curator = input.curator;
  if (!curator) {
    throw new Error('Login required');
  }
  if (!(await isGroupMember(curator.id, groupName))) {
    throw new Error('You are not a member of this group');
  }

  const parentId = input.parent_id && Number.isFinite(input.parent_id) && input.parent_id > 0 ? input.parent_id : null;
  const author = curator.username;
  const curatorId = curator.id;

  const pool = getPool();

  if (parentId) {
    const { rows: parent } = await pool.sql<{ id: number; group_name: string }>`
      SELECT id, group_name FROM group_messages WHERE id = ${parentId} LIMIT 1
    `;
    if (!parent[0] || parent[0].group_name !== groupName) {
      throw new Error('Parent message not found');
    }
  }

  const { rows } = await pool.sql<GroupMessageRecord>`
    INSERT INTO group_messages (group_name, parent_id, author, content, curator_id)
    VALUES (${groupName}, ${parentId}, ${author}, ${content}, ${curatorId})
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not create message');

  await pool.sql`UPDATE groups SET updated_at = NOW() WHERE name = ${groupName}`;

  return rows[0];
}

export async function getAllGroupMessages(name: string): Promise<GroupMessageRecord[]> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();
  const { rows } = await getPool().sql<GroupMessageRecord>`
    SELECT * FROM group_messages WHERE group_name = ${name} ORDER BY created_at ASC
  `;
  return rows;
}

export async function getGroupMessageById(
  groupName: string,
  messageId: number
): Promise<GroupMessageRecord | null> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  if (!messageId || !Number.isFinite(messageId)) return null;
  await ensureSchema();
  const { rows } = await getPool().sql<GroupMessageRecord>`
    SELECT * FROM group_messages WHERE id = ${messageId} AND group_name = ${groupName} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function hasReplies(messageId: number): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().sql<{ count: number }>`
    SELECT COUNT(*) AS count FROM group_messages WHERE parent_id = ${messageId}
  `;
  return Number(rows[0]?.count || 0) > 0;
}

async function getMessageReactionsForGroup(
  groupName: string
): Promise<GroupReactionRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().sql<GroupReactionRecord>`
    SELECT r.*
    FROM group_reactions r
    JOIN group_messages m ON m.id = r.message_id
    WHERE m.group_name = ${groupName}
  `;
  return rows;
}

function aggregateReactions(
  reactions: GroupReactionRecord[],
  messageId: number,
  currentCuratorId?: string
): GroupReactionSummary[] {
  const byEmoji = new Map<string, { count: number; reacted: boolean }>();
  for (const r of reactions) {
    if (r.message_id !== messageId) continue;
    const entry = byEmoji.get(r.emoji) || { count: 0, reacted: false };
    entry.count += 1;
    if (currentCuratorId && r.curator_id === currentCuratorId) {
      entry.reacted = true;
    }
    byEmoji.set(r.emoji, entry);
  }
  return Array.from(byEmoji.entries()).map(([emoji, { count, reacted }]) => ({
    emoji,
    count,
    reacted,
  }));
}

function buildMessageTree(
  messages: GroupMessageRecord[],
  reactions: GroupReactionRecord[],
  currentCuratorId?: string,
  isCreator = false
): GroupMessageNode[] {
  const byParent = new Map<number | null, GroupMessageRecord[]>();
  for (const m of messages) {
    const key = m.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(m);
  }

  function render(parentId: number | null): GroupMessageNode[] {
    const children = byParent.get(parentId) || [];
    return children.map((m): GroupMessageNode => {
      const isAuthor = !!currentCuratorId && m.curator_id === currentCuratorId;
      const inEditWindow =
        Date.now() - new Date(m.created_at).getTime() <= 5 * 60 * 1000;
      const hasChildren = byParent.has(m.id) && (byParent.get(m.id)?.length || 0) > 0;
      return {
        ...m,
        children: render(m.id),
        reactions: aggregateReactions(reactions, m.id, currentCuratorId),
        can_edit: isAuthor && !m.hidden && inEditWindow,
        can_delete: (isAuthor || isCreator) && !hasChildren,
        is_author: isAuthor,
      };
    });
  }

  return render(null);
}

export async function getGroupMessageTree(
  name: string,
  currentCuratorId?: string,
  isCreator = false
): Promise<GroupMessageNode[]> {
  const [messages, reactions] = await Promise.all([
    getAllGroupMessages(name),
    getMessageReactionsForGroup(name),
  ]);
  return buildMessageTree(messages, reactions, currentCuratorId, isCreator);
}

export async function updateGroupMessage(
  groupName: string,
  messageId: number,
  curator: CuratorRecord,
  content: string
): Promise<GroupMessageRecord> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  await ensureSchema();

  const message = await getGroupMessageById(groupName, messageId);
  if (!message) throw new Error('Message not found');
  if (message.hidden) throw new Error('Cannot edit a hidden message');
  if (message.curator_id !== curator.id) throw new Error('Only the author can edit');
  if (Date.now() - new Date(message.created_at).getTime() > 5 * 60 * 1000) {
    throw new Error('The 5-minute edit window has expired');
  }

  const safeContent = content.trim();
  if (!safeContent) throw new Error('Message content is required');
  if (safeContent.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Content too long (max ${MAX_MESSAGE_LENGTH})`);
  }

  const { rows } = await getPool().sql<GroupMessageRecord>`
    UPDATE group_messages
    SET content = ${safeContent}, updated_at = NOW()
    WHERE id = ${messageId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not update message');
  return rows[0];
}

export async function deleteGroupMessage(
  groupName: string,
  messageId: number,
  curator: CuratorRecord
): Promise<void> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  await ensureSchema();

  const message = await getGroupMessageById(groupName, messageId);
  if (!message) throw new Error('Message not found');

  const role = await getGroupMemberRole(curator.id, groupName);
  if (!role) throw new Error('Membership required');
  if (message.curator_id !== curator.id && role !== 'creator') {
    throw new Error('Only the author or creator can delete');
  }

  if (await hasReplies(messageId)) {
    throw new Error('Cannot delete a message that has replies');
  }

  await getPool().sql`DELETE FROM group_messages WHERE id = ${messageId}`;
}

export async function hideGroupMessage(
  groupName: string,
  messageId: number,
  curator: CuratorRecord,
  reason?: string | null
): Promise<GroupMessageRecord> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  await ensureSchema();

  const role = await getGroupMemberRole(curator.id, groupName);
  if (role !== 'creator') throw new Error('Only the creator can hide messages');

  const message = await getGroupMessageById(groupName, messageId);
  if (!message) throw new Error('Message not found');

  const safeReason = reason?.trim() || 'Este mensaje se ocultó porque no respetó las reglas.';
  const { rows } = await getPool().sql<GroupMessageRecord>`
    UPDATE group_messages
    SET hidden = TRUE, hidden_reason = ${safeReason}
    WHERE id = ${messageId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Could not hide message');

  await resolveGroupReportsForMessage(groupName, messageId);
  return rows[0];
}

export async function addOrRemoveGroupReaction(
  groupName: string,
  messageId: number,
  curator: CuratorRecord,
  emoji: string
): Promise<boolean> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  if (!(await isGroupMember(curator.id, groupName))) {
    throw new Error('You are not a member of this group');
  }

  const message = await getGroupMessageById(groupName, messageId);
  if (!message) throw new Error('Message not found');

  const safeEmoji = emoji.trim().slice(0, 32);
  if (!safeEmoji) throw new Error('Invalid emoji');

  const pool = getPool();
  const { rows } = await pool.sql<GroupReactionRecord>`
    SELECT * FROM group_reactions
    WHERE message_id = ${messageId} AND curator_id = ${curator.id} AND emoji = ${safeEmoji}
    LIMIT 1
  `;

  if (rows[0]) {
    await pool.sql`DELETE FROM group_reactions WHERE id = ${rows[0].id}`;
    return false;
  }

  await pool.sql`
    INSERT INTO group_reactions (message_id, curator_id, emoji)
    VALUES (${messageId}, ${curator.id}, ${safeEmoji})
  `;
  return true;
}

export async function reportGroupMessage(
  groupName: string,
  messageId: number,
  reporter: CuratorRecord,
  reason?: string | null
): Promise<void> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  if (!(await isGroupMember(reporter.id, groupName))) {
    throw new Error('You are not a member of this group');
  }

  const message = await getGroupMessageById(groupName, messageId);
  if (!message) throw new Error('Message not found');

  await getPool().sql`
    INSERT INTO group_reports (group_name, message_id, reporter_id, reason)
    VALUES (${groupName}, ${messageId}, ${reporter.id}, ${reason?.trim() || null})
  `;
}

async function resolveGroupReportsForMessage(
  groupName: string,
  messageId: number
): Promise<void> {
  await getPool().sql`
    UPDATE group_reports SET resolved = TRUE
    WHERE group_name = ${groupName} AND message_id = ${messageId}
  `;
}

export async function getGroupReports(
  groupName: string,
  curatorId: string
): Promise<GroupReportWithDetails[]> {
  if (!validateGroupName(groupName)) throw new Error('Invalid group name');
  const role = await getGroupMemberRole(curatorId, groupName);
  if (role !== 'creator') throw new Error('Only the creator can view reports');

  const { rows } = await getPool().sql<GroupReportWithDetails>`
    SELECT r.*, m.author, m.content AS message_content, c.username AS reporter_username
    FROM group_reports r
    JOIN group_messages m ON m.id = r.message_id
    LEFT JOIN curators c ON c.id = r.reporter_id
    WHERE r.group_name = ${groupName} AND r.resolved = FALSE
    ORDER BY r.created_at DESC
  `;
  return rows;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const URL_RE = /https?:\/\/[^\s<]+/g;

export function linkifyMessageContent(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(
    URL_RE,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener nofollow" class="text-primary underline break-all">${url}</a><span class="text-[10px] text-muted ml-1" title="Ten cuidado al abrir enlaces fuera de Openbin">(cuidado)</span>`
  );
}
