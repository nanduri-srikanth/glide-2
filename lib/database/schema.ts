import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  folder_id: text('folder_id'),
  title: text('title').notNull(),
  transcript: text('transcript'),
  summary: text('summary'),
  duration: integer('duration'),
  audio_url: text('audio_url'),
  local_audio_path: text('local_audio_path'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  is_pinned: integer('is_pinned', { mode: 'boolean' }).default(false),
  is_archived: integer('is_archived', { mode: 'boolean' }).default(false),
  is_deleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  ai_metadata: text('ai_metadata', { mode: 'json' }),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  // Sync tracking
  sync_status: text('sync_status').$type<SyncStatus>().default('synced'),
  local_updated_at: text('local_updated_at'),
  server_updated_at: text('server_updated_at'),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color'),
  is_system: integer('is_system', { mode: 'boolean' }).default(false),
  sort_order: integer('sort_order').notNull(),
  parent_id: text('parent_id'),
  depth: integer('depth').default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  sync_status: text('sync_status').$type<SyncStatus>().default('synced'),
});

export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  note_id: text('note_id').notNull(),
  action_type: text('action_type').notNull(),
  status: text('status').notNull(),
  priority: text('priority'),
  title: text('title').notNull(),
  description: text('description'),
  scheduled_date: text('scheduled_date'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  sync_status: text('sync_status').$type<SyncStatus>().default('synced'),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entity_type: text('entity_type').notNull(), // note | folder | action
  entity_id: text('entity_id').notNull(),
  operation: text('operation').notNull(), // create | update | delete
  payload: text('payload', { mode: 'json' }),
  created_at: text('created_at').notNull(),
  retry_count: integer('retry_count').default(0),
  last_error: text('last_error'),
  status: text('status').default('pending'), // pending | processing | failed
});

export const metadata = sqliteTable('metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: text('updated_at').notNull(),
});

export type AudioUploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export const audioUploads = sqliteTable('audio_uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  note_id: text('note_id').notNull(),
  local_path: text('local_path').notNull(),
  remote_url: text('remote_url'), // Set after successful upload
  file_size: integer('file_size'),
  status: text('status').$type<AudioUploadStatus>().default('pending'),
  retry_count: integer('retry_count').default(0),
  last_error: text('last_error'),
  created_at: text('created_at').notNull(),
  uploaded_at: text('uploaded_at'),
});

export const noteRichContent = sqliteTable('note_rich_content', {
  note_id: text('note_id').primaryKey(),
  rtf_base64: text('rtf_base64').notNull(),
  plaintext: text('plaintext'),
  updated_at: text('updated_at').notNull(),
});

export type NoteRichContentRow = typeof noteRichContent.$inferSelect;
export type NoteRichContentInsert = typeof noteRichContent.$inferInsert;

// Type exports for use in repositories
export type NoteRow = typeof notes.$inferSelect;
export type NoteInsert = typeof notes.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type FolderInsert = typeof folders.$inferInsert;
export type ActionRow = typeof actions.$inferSelect;
export type ActionInsert = typeof actions.$inferInsert;
export type SyncQueueRow = typeof syncQueue.$inferSelect;
export type SyncQueueInsert = typeof syncQueue.$inferInsert;
export type MetadataRow = typeof metadata.$inferSelect;
export type AudioUploadRow = typeof audioUploads.$inferSelect;
export type AudioUploadInsert = typeof audioUploads.$inferInsert;
