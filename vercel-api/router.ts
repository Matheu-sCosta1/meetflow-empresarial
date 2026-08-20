import { randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse, UploadedFile } from "./http.js";
import { assertAuthConfigured, authenticated, authenticationKey, hashPassword, mapUser, signToken, userByEmail, verifyPassword, type AuthenticatedUser } from "./auth.js";
import { ensureSchema, query, transaction, type DbStatement } from "./db.js";
import { HttpError, empty, isEmail, json, jsonBody, multipart, optional, required } from "./http.js";

type UnknownBody = Record<string, unknown>;
type QueryRow = Record<string, unknown>;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function userView(user: AuthenticatedUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    avatarUrl: user.avatarUrl,
    organizationId: user.organizationId,
    organizationName: user.organizationName,
    organizationSlug: user.organizationSlug,
  };
}

function slugify(value: string) {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "empresa";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function dateValue(value: unknown, label: string) {
  const date = new Date(typeof value === "string" ? value : "");
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, `${label} inválido`);
  return date;
}

function requireAdmin(role: string) {
  if (role !== "ADMIN") throw new HttpError(403, "Apenas administradores podem realizar esta ação");
}

function validateStrongPassword(password: string, label = "A senha") {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, `${label} deve ter ao menos 10 caracteres, uma letra maiúscula e um número`);
  }
}

async function enforceLoginRateLimit(key: string) {
  const rows = await query<QueryRow>(`SELECT blocked_until FROM auth_rate_limits WHERE key_hash = $1`, [key]);
  const blockedUntil = rows[0]?.blocked_until ? new Date(String(rows[0].blocked_until)) : null;
  if (blockedUntil && blockedUntil > new Date()) {
    throw new HttpError(429, "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente");
  }
}

async function recordLoginFailure(key: string) {
  await query(`INSERT INTO auth_rate_limits(key_hash, failures, blocked_until, updated_at)
    VALUES ($1, 1, NULL, NOW()) ON CONFLICT (key_hash) DO UPDATE SET
    failures = CASE WHEN auth_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limits.failures + 1 END,
    blocked_until = CASE
      WHEN (CASE WHEN auth_rate_limits.updated_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limits.failures + 1 END) >= 5
      THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
    updated_at = NOW()`, [key]);
}

function databaseMedia(content: unknown) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  const text = String(content ?? "");
  return text.startsWith("\\x") ? Buffer.from(text.slice(2), "hex") : Buffer.from(text, "base64");
}

function parseParticipants(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value) as unknown[]; } catch { return []; }
  }
  return [];
}

function meetingView(row: QueryRow) {
  return {
    id: String(row.id),
    title: String(row.title),
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    status: String(row.status),
    mode: String(row.mode),
    location: row.location ? String(row.location) : null,
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name),
    participants: parseParticipants(row.participants),
  };
}

function channelView(row: QueryRow) {
  return { id: String(row.id), name: String(row.name), type: String(row.type), createdAt: iso(row.created_at) };
}

function messageView(row: QueryRow) {
  return {
    id: String(row.id), channelId: String(row.channel_id), senderId: String(row.sender_id),
    senderName: String(row.sender_name), content: String(row.content), messageType: String(row.message_type),
    attachmentUrl: row.attachment_url ? String(row.attachment_url) : null, createdAt: iso(row.created_at),
  };
}

function statusView(row: QueryRow) {
  return {
    id: String(row.id), authorId: String(row.author_id), authorName: String(row.author_name),
    mediaType: String(row.media_type), mediaUrl: row.media_url ? String(row.media_url) : null,
    caption: row.caption ? String(row.caption) : null, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at),
  };
}

function memberView(row: QueryRow) {
  return {
    id: String(row.id), name: String(row.name), email: String(row.email), role: String(row.role),
    jobTitle: String(row.job_title), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, active: Boolean(row.active),
  };
}

async function meetingRows(organizationId: string, id?: string, from?: string, to?: string) {
  const conditions = ["m.organization_id = $1"];
  const params: Array<string> = [organizationId];
  if (id) { params.push(id); conditions.push(`m.id = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`m.start_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`m.start_at <= $${params.length}`); }
  return await query<QueryRow>(`SELECT m.*, u.name AS owner_name,
    COALESCE((SELECT json_agg(json_build_object('name', p.name, 'email', p.email) ORDER BY p.created_at)
      FROM meeting_participants p WHERE p.meeting_id = m.id), '[]'::json) AS participants
    FROM meetings m JOIN users u ON u.id = m.owner_id
    WHERE ${conditions.join(" AND ")} ORDER BY m.start_at`, params);
}

async function register(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const name = required(body.name, "Nome", 120);
  const jobTitle = required(body.jobTitle, "Cargo", 120);
  const organizationName = required(body.organizationName, "Nome da empresa", 120);
  const email = required(body.email, "E-mail", 180).toLowerCase();
  const password = required(body.password, "Senha", 200);
  if (!isEmail(email)) throw new HttpError(400, "Informe um e-mail válido");
  validateStrongPassword(password);
  if (body.acceptTerms !== true) throw new HttpError(400, "Aceite os Termos de Uso e a Política de Privacidade para continuar");
  if (await userByEmail(email)) throw new HttpError(409, "Já existe uma conta com este e-mail");

  const now = new Date().toISOString();
  const organizationId = randomUUID();
  const userId = randomUUID();
  const organizationSlug = slugify(organizationName);
  const passwordHash = await hashPassword(password);
  const statements: DbStatement[] = [
    { text: `INSERT INTO organizations(id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)`, params: [organizationId, organizationName, organizationSlug, now] },
    { text: `INSERT INTO users(id, organization_id, name, email, password_hash, role, job_title, terms_accepted_at, active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'ADMIN',$6,$7,TRUE,$7,$7)`, params: [userId, organizationId, name, email, passwordHash, jobTitle, now] },
    { text: `INSERT INTO chat_channels(id, organization_id, created_by_id, name, type, created_at, updated_at)
      VALUES ($1,$2,$3,'Geral','GROUP',$4,$4)`, params: [randomUUID(), organizationId, userId, now] },
  ];
  for (let day = 1; day <= 5; day += 1) {
    statements.push({ text: `INSERT INTO availabilities(id, owner_id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at)
      VALUES ($1,$2,$3,'09:00','18:00','America/Sao_Paulo',TRUE,$4,$4)`, params: [randomUUID(), userId, day, now] });
  }
  const user = { id: userId, organizationId, name, email, role: "ADMIN" as const, jobTitle, avatarUrl: null, organizationName, organizationSlug };
  const token = signToken(user, true);
  await transaction(statements);
  json(response, 201, { token, user: userView(user) });
}

async function login(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const email = required(body.email, "E-mail", 180).toLowerCase();
  const password = required(body.password, "Senha", 200);
  const remember = body.remember === true;
  const rateKey = authenticationKey(email, request.headers);
  await enforceLoginRateLimit(rateKey);
  const row = await userByEmail(email);
  if (!row?.active || !await verifyPassword(password, row.password_hash)) {
    await recordLoginFailure(rateKey);
    throw new HttpError(401, "E-mail ou senha inválidos");
  }
  await query(`DELETE FROM auth_rate_limits WHERE key_hash = $1`, [rateKey]);
  const user = mapUser(row);
  json(response, 200, { token: signToken(user, remember), user: userView(user) });
}

async function publicMedia(response: ApiResponse, id: string) {
  const rows = await query<QueryRow>(`SELECT mo.content, mo.content_type, mo.original_name, mo.size_bytes
    FROM media_objects mo WHERE mo.id = $1 AND (
      EXISTS (SELECT 1 FROM users u WHERE u.avatar_url = '/api/public/media/' || mo.id::text AND u.active = TRUE)
      OR EXISTS (SELECT 1 FROM team_statuses s WHERE s.media_url = '/api/public/media/' || mo.id::text AND s.expires_at > NOW())
    )`, [id]);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Arquivo não encontrado");
  response.statusCode = 200;
  response.setHeader("Content-Type", String(row.content_type));
  response.setHeader("Content-Length", String(row.size_bytes));
  response.setHeader("Cache-Control", "public, max-age=3600");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(databaseMedia(row.content));
}

async function listMeetings(request: ApiRequest, response: ApiResponse, organizationId: string) {
  const from = typeof request.query.from === "string" ? dateValue(request.query.from, "Data inicial").toISOString() : undefined;
  const to = typeof request.query.to === "string" ? dateValue(request.query.to, "Data final").toISOString() : undefined;
  if (from && to && from > to) throw new HttpError(400, "O período informado é inválido");
  json(response, 200, (await meetingRows(organizationId, undefined, from, to)).map(meetingView));
}

async function createMeeting(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const body = await jsonBody<UnknownBody>(request);
  const title = required(body.title, "Título", 160);
  const ownerId = required(body.ownerId, "Responsável", 100);
  const startAt = dateValue(body.startAt, "Início");
  const endAt = dateValue(body.endAt, "Término");
  if (endAt <= startAt) throw new HttpError(400, "O término deve ser posterior ao início");
  const mode = required(body.mode, "Formato", 30);
  if (!new Set(["VIDEO", "IN_PERSON"]).has(mode)) throw new HttpError(400, "Formato de reunião inválido");
  const location = optional(body.location, 300);
  const notes = optional(body.notes, 2000);
  const owners = await query<QueryRow>(`SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND active = TRUE`, [ownerId, user.organizationId]);
  if (!owners[0]) throw new HttpError(404, "Responsável não encontrado na empresa");
  const conflicts = await query<QueryRow>(`SELECT id FROM meetings WHERE owner_id = $1 AND status <> 'CANCELLED'
    AND start_at < $2 AND end_at > $3 LIMIT 1`, [ownerId, endAt.toISOString(), startAt.toISOString()]);
  if (conflicts[0]) throw new HttpError(409, "O responsável já possui uma reunião neste horário");

  const guests = Array.isArray(body.guests) ? body.guests.slice(0, 50) : [];
  const now = new Date().toISOString();
  const id = randomUUID();
  const statements: DbStatement[] = [{ text: `INSERT INTO meetings(id, organization_id, owner_id, created_by_id, title, start_at, end_at,
    status, mode, location, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'CONFIRMED',$8,$9,$10,$11,$11)`,
    params: [id, user.organizationId, ownerId, user.id, title, startAt, endAt, mode, location, notes, now] }];
  for (const guestValue of guests) {
    const guest = guestValue && typeof guestValue === "object" ? guestValue as UnknownBody : {};
    const email = required(guest.email, "E-mail do convidado", 180).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, `E-mail de convidado inválido: ${email}`);
    const guestName = optional(guest.name, 120) ?? email.split("@")[0];
    statements.push({ text: `INSERT INTO meeting_participants(id, meeting_id, name, email, response_status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'PENDING',$5,$5)`, params: [randomUUID(), id, guestName, email, now] });
  }
  await transaction(statements);
  json(response, 201, meetingView((await meetingRows(user.organizationId, id))[0]));
}

async function cancelMeeting(request: ApiRequest, response: ApiResponse, organizationId: string, id: string) {
  const body = await jsonBody<UnknownBody>(request);
  const reason = required(body.reason, "Motivo", 500);
  const rows = await query<QueryRow>(`UPDATE meetings SET status = 'CANCELLED', cancellation_reason = $1, updated_at = $2
    WHERE id = $3 AND organization_id = $4 RETURNING id`, [reason, new Date().toISOString(), id, organizationId]);
  if (!rows[0]) throw new HttpError(404, "Reunião não encontrada");
  json(response, 200, meetingView((await meetingRows(organizationId, id))[0]));
}

async function listChannels(response: ApiResponse, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT id, name, type, created_at FROM chat_channels WHERE organization_id = $1 ORDER BY created_at`, [organizationId]);
  json(response, 200, rows.map(channelView));
}

async function createChannel(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const body = await jsonBody<UnknownBody>(request);
  const name = required(body.name, "Nome do canal", 100);
  const type = body.type === "DIRECT" ? "DIRECT" : "GROUP";
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await query<QueryRow>(`INSERT INTO chat_channels(id, organization_id, created_by_id, name, type, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, name, type, created_at`, [id, user.organizationId, user.id, name, type, now]);
  json(response, 201, channelView(rows[0]));
}

async function channelForUser(channelId: string, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT id FROM chat_channels WHERE id = $1 AND organization_id = $2`, [channelId, organizationId]);
  if (!rows[0]) throw new HttpError(404, "Canal não encontrado");
}

async function listMessages(response: ApiResponse, channelId: string, organizationId: string) {
  await channelForUser(channelId, organizationId);
  const rows = await query<QueryRow>(`SELECT * FROM (SELECT m.id, m.channel_id, m.sender_id, u.name AS sender_name,
    m.content, m.message_type, m.attachment_url, m.created_at FROM chat_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.channel_id = $1 ORDER BY m.created_at DESC LIMIT 200) recent ORDER BY created_at`, [channelId]);
  json(response, 200, rows.map(messageView));
}

async function createMessage(request: ApiRequest, response: ApiResponse, channelId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await channelForUser(channelId, user.organizationId);
  const body = await jsonBody<UnknownBody>(request);
  const content = required(body.content, "Mensagem", 4000);
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await query<QueryRow>(`INSERT INTO chat_messages(id, channel_id, sender_id, content, message_type, created_at, updated_at)
    VALUES ($1,$2,$3,$4,'TEXT',$5,$5) RETURNING id, channel_id, sender_id, content, message_type, attachment_url, created_at`,
    [id, channelId, user.id, content, now]);
  json(response, 201, messageView({ ...rows[0], sender_name: user.name }));
}

async function listStatuses(response: ApiResponse, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT s.id, s.author_id, u.name AS author_name, s.media_type, s.media_url,
    s.caption, s.created_at, s.expires_at FROM team_statuses s JOIN users u ON u.id = s.author_id
    WHERE s.organization_id = $1 AND s.expires_at > NOW() ORDER BY s.created_at DESC`, [organizationId]);
  json(response, 200, rows.map(statusView));
}

function validateStatusFile(file: UploadedFile) {
  if (!IMAGE_TYPES.has(file.mimeType) && !VIDEO_TYPES.has(file.mimeType)) {
    throw new HttpError(415, "Use JPG, PNG, WebP, MP4, MOV ou WebM");
  }
}

async function createStatus(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const { fields, file } = await multipart(request);
  const caption = optional(fields.caption, 1000);
  if (!caption && !file) throw new HttpError(400, "Escreva uma legenda ou escolha um arquivo");
  if (file) validateStatusFile(file);
  const now = new Date();
  const statusId = randomUUID();
  const mediaId = file ? randomUUID() : null;
  const mediaUrl = mediaId ? `/api/public/media/${mediaId}` : null;
  const mediaType = file ? (IMAGE_TYPES.has(file.mimeType) ? "IMAGE" : "VIDEO") : "TEXT";
  const statements: DbStatement[] = [];
  if (file && mediaId) statements.push({ text: `INSERT INTO media_objects(id, content_type, original_name, size_bytes, content, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$6)`, params: [mediaId, file.mimeType, file.filename, file.content.length, file.content, now] });
  statements.push({ text: `INSERT INTO team_statuses(id, organization_id, author_id, media_type, media_url, caption, expires_at, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`, params: [statusId, user.organizationId, user.id, mediaType, mediaUrl, caption, new Date(now.getTime() + 86_400_000), now] });
  await transaction(statements);
  const rows = await query<QueryRow>(`SELECT s.id, s.author_id, u.name AS author_name, s.media_type, s.media_url, s.caption,
    s.created_at, s.expires_at FROM team_statuses s JOIN users u ON u.id = s.author_id WHERE s.id = $1`, [statusId]);
  json(response, 201, statusView(rows[0]));
}

async function deleteStatus(response: ApiResponse, id: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const rows = await query<QueryRow>(`DELETE FROM team_statuses WHERE id = $1 AND organization_id = $2
    AND (author_id = $3 OR $4 = 'ADMIN') RETURNING media_url`, [id, user.organizationId, user.id, user.role]);
  if (!rows[0]) throw new HttpError(404, "Status não encontrado");
  const mediaUrl = rows[0].media_url ? String(rows[0].media_url) : "";
  const mediaId = mediaUrl.match(/^\/api\/public\/media\/([0-9a-f-]+)$/)?.[1];
  if (mediaId) await query(`DELETE FROM media_objects WHERE id = $1`, [mediaId]);
  empty(response);
}

async function listTeam(response: ApiResponse, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT id, name, email, role, job_title, avatar_url, active FROM users
    WHERE organization_id = $1 ORDER BY active DESC, name`, [organizationId]);
  json(response, 200, rows.map(memberView));
}

async function addTeamMember(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  requireAdmin(user.role);
  const body = await jsonBody<UnknownBody>(request);
  const name = required(body.name, "Nome", 120);
  const email = required(body.email, "E-mail", 180).toLowerCase();
  const password = required(body.password, "Senha", 200);
  const jobTitle = required(body.jobTitle, "Cargo", 120);
  const role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";
  if (!isEmail(email)) throw new HttpError(400, "Informe um e-mail válido");
  validateStrongPassword(password);
  if (await userByEmail(email)) throw new HttpError(409, "Já existe uma conta com este e-mail");
  const id = randomUUID();
  const now = new Date().toISOString();
  const statements: DbStatement[] = [{ text: `INSERT INTO users(id, organization_id, name, email, password_hash, role, job_title, active, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$8)`, params: [id, user.organizationId, name, email, await hashPassword(password), role, jobTitle, now] }];
  for (let day = 1; day <= 5; day += 1) statements.push({ text: `INSERT INTO availabilities(id, owner_id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at)
    VALUES ($1,$2,$3,'09:00','18:00','America/Sao_Paulo',TRUE,$4,$4)`, params: [randomUUID(), id, day, now] });
  await transaction(statements);
  json(response, 201, memberView({ id, name, email, role, job_title: jobTitle, avatar_url: null, active: true }));
}

async function removeTeamMember(response: ApiResponse, id: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  requireAdmin(user.role);
  if (id === user.id) throw new HttpError(400, "Use a opção Excluir minha conta para desativar seu próprio acesso");
  const rows = await query<QueryRow>(`UPDATE users SET active = FALSE, updated_at = $1 WHERE id = $2 AND organization_id = $3 AND active = TRUE RETURNING id`,
    [new Date().toISOString(), id, user.organizationId]);
  if (!rows[0]) throw new HttpError(404, "Colaborador não encontrado");
  empty(response);
}

async function updatedUser(userId: string) {
  const rows = await query<QueryRow>(`SELECT u.id, u.organization_id, u.name, u.email, u.role, u.job_title, u.avatar_url,
    o.name AS organization_name, o.slug AS organization_slug FROM users u JOIN organizations o ON o.id = u.organization_id WHERE u.id = $1`, [userId]);
  return mapUser(rows[0] as Parameters<typeof mapUser>[0]);
}

async function updateProfile(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const body = await jsonBody<UnknownBody>(request);
  const name = required(body.name, "Nome", 120);
  const jobTitle = required(body.jobTitle, "Cargo", 120);
  const statements: DbStatement[] = [{ text: `UPDATE users SET name = $1, job_title = $2, updated_at = $3 WHERE id = $4`, params: [name, jobTitle, new Date(), user.id] }];
  if (body.organizationName !== undefined) {
    const organizationName = required(body.organizationName, "Nome da empresa", 120);
    if (organizationName !== user.organizationName) requireAdmin(user.role);
    statements.push({ text: `UPDATE organizations SET name = $1, updated_at = $2 WHERE id = $3`, params: [organizationName, new Date(), user.organizationId] });
  }
  await transaction(statements);
  json(response, 200, userView(await updatedUser(user.id)));
}

async function uploadAvatar(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const { file } = await multipart(request);
  if (!file) throw new HttpError(400, "Escolha uma imagem");
  if (!IMAGE_TYPES.has(file.mimeType)) throw new HttpError(415, "Use uma imagem JPG, PNG ou WebP");
  const mediaId = randomUUID();
  const mediaUrl = `/api/public/media/${mediaId}`;
  const now = new Date();
  await transaction([
    { text: `INSERT INTO media_objects(id, content_type, original_name, size_bytes, content, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$6)`, params: [mediaId, file.mimeType, file.filename, file.content.length, file.content, now] },
    { text: `UPDATE users SET avatar_url = $1, updated_at = $2 WHERE id = $3`, params: [mediaUrl, now, user.id] },
  ]);
  json(response, 200, userView(await updatedUser(user.id)));
}

async function changePassword(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const body = await jsonBody<UnknownBody>(request);
  const currentPassword = required(body.currentPassword, "Senha atual", 200);
  const newPassword = required(body.newPassword, "Nova senha", 200);
  validateStrongPassword(newPassword, "A nova senha");
  const row = await userByEmail(user.email);
  if (!row || !await verifyPassword(currentPassword, row.password_hash)) throw new HttpError(401, "A senha atual está incorreta");
  await query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [await hashPassword(newPassword), new Date(), user.id]);
  empty(response);
}

async function deleteAccount(request: ApiRequest, response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const body = await jsonBody<UnknownBody>(request);
  if (body.confirmation !== "EXCLUIR") throw new HttpError(400, "Digite EXCLUIR para confirmar");
  await query(`UPDATE users SET active = FALSE, email = $1, avatar_url = NULL, updated_at = $2 WHERE id = $3`,
    [`deleted+${user.id}@invalid.local`, new Date(), user.id]);
  empty(response);
}

function samePath(path: string[], ...parts: string[]) {
  return path.length === parts.length && parts.every((part, index) => part === "*" || path[index] === part);
}

export async function route(request: ApiRequest, response: ApiResponse, path: string[]) {
  try {
    await ensureSchema();
    const method = request.method?.toUpperCase() ?? "GET";
    if (method === "OPTIONS") return empty(response);
    if (method === "GET" && samePath(path, "health")) {
      assertAuthConfigured();
      return json(response, 200, { status: "ok", database: "connected", authentication: "configured" });
    }
    if (method === "POST" && samePath(path, "auth", "register")) return await register(request, response);
    if (method === "POST" && samePath(path, "auth", "login")) return await login(request, response);
    if (method === "GET" && samePath(path, "public", "media", "*")) return await publicMedia(response, path[2]);

    const user = await authenticated(request.headers);
    if (!user) throw new HttpError(401, "Sua sessão expirou. Entre novamente");
    if (method === "GET" && samePath(path, "auth", "me")) return json(response, 200, userView(user));
    if (samePath(path, "meetings") && method === "GET") return await listMeetings(request, response, user.organizationId);
    if (samePath(path, "meetings") && method === "POST") return await createMeeting(request, response, user);
    if (samePath(path, "meetings", "*", "cancel") && method === "PATCH") return await cancelMeeting(request, response, user.organizationId, path[1]);
    if (samePath(path, "chat", "channels") && method === "GET") return await listChannels(response, user.organizationId);
    if (samePath(path, "chat", "channels") && method === "POST") return await createChannel(request, response, user);
    if (samePath(path, "chat", "channels", "*", "messages") && method === "GET") return await listMessages(response, path[2], user.organizationId);
    if (samePath(path, "chat", "channels", "*", "messages") && method === "POST") return await createMessage(request, response, path[2], user);
    if (samePath(path, "statuses") && method === "GET") return await listStatuses(response, user.organizationId);
    if (samePath(path, "statuses") && method === "POST") return await createStatus(request, response, user);
    if (samePath(path, "statuses", "*") && method === "DELETE") return await deleteStatus(response, path[1], user);
    if (samePath(path, "team") && method === "GET") return await listTeam(response, user.organizationId);
    if (samePath(path, "team") && method === "POST") return await addTeamMember(request, response, user);
    if (samePath(path, "team", "*") && method === "DELETE") return await removeTeamMember(response, path[1], user);
    if (samePath(path, "account", "profile") && method === "PATCH") return await updateProfile(request, response, user);
    if (samePath(path, "account", "avatar") && method === "POST") return await uploadAvatar(request, response, user);
    if (samePath(path, "account", "password") && method === "PATCH") return await changePassword(request, response, user);
    if (samePath(path, "account") && method === "DELETE") return await deleteAccount(request, response, user);
    throw new HttpError(404, "Rota não encontrada");
  } catch (error) {
    if (response.writableEnded) return;
    if (error instanceof HttpError) return json(response, error.status, { detail: error.message });
    if (error instanceof SyntaxError) return json(response, 400, { detail: "Dados enviados em formato inválido" });
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") return json(response, 409, { detail: "Este registro já existe" });
    if (databaseError.code === "22P02") return json(response, 400, { detail: "Identificador inválido" });
    console.error("MeetFlow API error", error);
    return json(response, 500, { detail: "Não foi possível concluir a operação" });
  }
}
