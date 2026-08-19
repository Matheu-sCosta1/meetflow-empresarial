// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull().default("Colaborador"),
    avatarKey: text("avatar_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("profiles_email_unique").on(table.email)],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerProfileId: text("owner_profile_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    profileId: text("profile_id"),
    inviteEmail: text("invite_email").notNull(),
    role: text("role", { enum: ["OWNER", "ADMIN", "MEMBER"] }).notNull().default("MEMBER"),
    status: text("status", { enum: ["ACTIVE", "PENDING"] }).notNull().default("PENDING"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("memberships_org_email_unique").on(table.organizationId, table.inviteEmail),
    index("memberships_profile_idx").on(table.profileId),
  ],
);

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["GROUP", "DIRECT"] }).notNull().default("GROUP"),
    createdByProfileId: text("created_by_profile_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("channels_org_idx").on(table.organizationId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    channelId: text("channel_id").notNull(),
    senderProfileId: text("sender_profile_id").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("messages_channel_time_idx").on(table.channelId, table.createdAt)],
);

export const meetings = sqliteTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    creatorProfileId: text("creator_profile_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("Reunião interna"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    mode: text("mode").notNull().default("Videoconferência"),
    guestEmail: text("guest_email"),
    status: text("status", { enum: ["CONFIRMED", "CANCELLED"] }).notNull().default("CONFIRMED"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("meetings_org_start_idx").on(table.organizationId, table.startsAt)],
);

export const statuses = sqliteTable(
  "statuses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    authorProfileId: text("author_profile_id").notNull(),
    caption: text("caption").notNull().default(""),
    mediaKey: text("media_key"),
    mediaType: text("media_type", { enum: ["IMAGE", "VIDEO", "TEXT"] }).notNull().default("TEXT"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("statuses_org_expiry_idx").on(table.organizationId, table.expiresAt)],
);
