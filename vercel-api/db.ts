import { neon } from "@neondatabase/serverless";

export type DbValue = string | number | boolean | Date | Buffer | string[] | null;

let client: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

function connectionString() {
  const value = process.env.MEETFLOW_DB_URL
    ?? process.env.MEETFLOW_DB_DATABASE_URL
    ?? process.env.MEETFLOW_DB_POSTGRES_URL
    ?? process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL;
  if (!value) throw new Error("Banco PostgreSQL não configurado");
  return value;
}

export function database() {
  client ??= neon(connectionString());
  return client;
}

export async function query<T>(text: string, params: DbValue[] = []): Promise<T[]> {
  return await database().query(text, params) as T[];
}

export type DbStatement = { text: string; params?: DbValue[] };

export async function transaction(statements: DbStatement[]) {
  const sql = database();
  return await sql.transaction(statements.map(({ text, params = [] }) => sql.query(text, params)));
}

const schema = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    job_title VARCHAR(120) NOT NULL DEFAULT 'Colaborador',
    avatar_url VARCHAR(500),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(120) NOT NULL DEFAULT 'Colaborador'`,
  `CREATE TABLE IF NOT EXISTS availabilities (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone VARCHAR(60) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (end_time > start_time)
  )`,
  `CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    created_by_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(160) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL,
    mode VARCHAR(30) NOT NULL,
    location VARCHAR(300),
    notes VARCHAR(2000),
    cancellation_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (end_at > start_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_meeting_owner_start ON meetings(owner_id, start_at)`,
  `CREATE INDEX IF NOT EXISTS idx_meeting_org_start ON meetings(organization_id, start_at)`,
  `CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL,
    response_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_channels (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_by_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content VARCHAR(4000) NOT NULL,
    message_type VARCHAR(20) NOT NULL,
    attachment_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON chat_messages(channel_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS media_objects (
    id UUID PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    original_name VARCHAR(255),
    size_bytes BIGINT NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_statuses (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    author_id UUID NOT NULL REFERENCES users(id),
    media_type VARCHAR(20) NOT NULL,
    media_url VARCHAR(500),
    caption VARCHAR(1000),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_status_org_expiry ON team_statuses(organization_id, expires_at)`,
];

async function initializeSchema() {
  const sql = database();
  await sql.transaction(schema.map((statement) => sql.query(statement)));
}

export function ensureSchema() {
  schemaReady ??= initializeSchema().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}
