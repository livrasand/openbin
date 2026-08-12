import {
  getPool,
  ensureSchema,
  type GroupRecord,
  type GroupMemberRecord,
  type GroupMessageRecord,
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

export type GroupMessageNode = GroupMessageRecord & { children: GroupMessageNode[] };

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

export async function getGroupMessages(name: string, parentId: number | null = null): Promise<GroupMessageRecord[]> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();
  const safeParentId = parentId && Number.isFinite(parentId) && parentId > 0 ? parentId : null;
  const { rows } = await getPool().sql<GroupMessageRecord>`
    SELECT * FROM group_messages
    WHERE group_name = ${name} AND parent_id IS NOT DISTINCT FROM ${safeParentId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function getAllGroupMessages(name: string): Promise<GroupMessageRecord[]> {
  if (!validateGroupName(name)) throw new Error('Invalid group name');
  await ensureSchema();
  const { rows } = await getPool().sql<GroupMessageRecord>`
    SELECT * FROM group_messages WHERE group_name = ${name} ORDER BY created_at ASC
  `;
  return rows;
}

function buildMessageTree(messages: GroupMessageRecord[]): GroupMessageNode[] {
  const byParent = new Map<number | null, GroupMessageRecord[]>();
  for (const m of messages) {
    const key = m.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(m);
  }

  function render(parentId: number | null): GroupMessageNode[] {
    const children = byParent.get(parentId) || [];
    return children.map((m): GroupMessageNode => ({ ...m, children: render(m.id) }));
  }

  return render(null);
}

export async function getGroupMessageTree(name: string): Promise<GroupMessageNode[]> {
  const messages = await getAllGroupMessages(name);
  return buildMessageTree(messages);
}
