import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ApiRequest, ApiResponse, UploadedFile } from "./http.js";
import { assertAuthConfigured, authenticated, authenticationKey, hashPassword, mapUser, signToken, userByEmail, verifyPassword, type AuthenticatedUser, type UserRole } from "./auth.js";
import { ensureSchema, query, transaction, type DbStatement } from "./db.js";
import { HttpError, empty, isEmail, json, jsonBody, multipart, optional, required } from "./http.js";
import { chatChannel, notificationChannel, publishRealtime, realtimeConfigured, realtimeToken } from "./realtime.js";
import { emailConfigured, sendPasswordResetEmail, sendTeamInvitationEmail, type MeetingEmailRecipient } from "./email.js";
import { cancelMeetingEmailJobs, meetingEmailJobStatements, processPendingMeetingEmailJobs } from "./meeting-emails.js";

type UnknownBody = Record<string, unknown>;
type QueryRow = Record<string, unknown>;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const PASSWORD_RESET_EXPIRES_MINUTES = 60;
const PASSWORD_RESET_RESPONSE = "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.";
const TEAM_INVITATION_EXPIRES_DAYS = 7;
const TERMS_VERSION = "2026.08";
const PRIVACY_VERSION = "2026.08";
const MANAGED_ROLES = new Set<UserRole>(["ADMIN", "MANAGER", "MEMBER"]);

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

function canManageTeam(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

function requireAdmin(role: string) {
  if (!canManageTeam(role)) throw new HttpError(403, "Apenas proprietários e administradores podem realizar esta ação");
}

function managedRole(value: unknown): Exclude<UserRole, "OWNER"> {
  const role = String(value ?? "MEMBER").toUpperCase() as UserRole;
  if (!MANAGED_ROLES.has(role)) throw new HttpError(400, "Nível de acesso inválido");
  return role as Exclude<UserRole, "OWNER">;
}

function roleLabel(role: UserRole) {
  if (role === "OWNER") return "Proprietário";
  if (role === "ADMIN") return "Administrador";
  if (role === "MANAGER") return "Gestor";
  return "Colaborador";
}

function cronAuthorized(request: ApiRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new HttpError(503, "Rotina de lembretes não configurada");
  const headerValue = request.headers.authorization;
  const authorization = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function validateStrongPassword(password: string, label = "A senha") {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, `${label} deve ter ao menos 10 caracteres, uma letra maiúscula e um número`);
  }
}

function acceptedLegalVersions(body: UnknownBody) {
  if (body.acceptTerms !== true) throw new HttpError(400, "Aceite os Termos de Uso e a Política de Privacidade para continuar");
  if (body.termsVersion !== TERMS_VERSION || body.privacyVersion !== PRIVACY_VERSION) {
    throw new HttpError(409, "Os documentos jurídicos foram atualizados. Reabra os Termos de Uso e a Política de Privacidade antes de continuar");
  }
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
}

function secureTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUrlWithHash(parameters: Record<string, string>) {
  const configured = process.env.MEETFLOW_PUBLIC_URL?.trim();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  const base = configured || (vercelHost ? (/^https?:\/\//i.test(vercelHost) ? vercelHost : `https://${vercelHost}`) : "");
  if (!base) throw new Error("Endereço público do MeetFlow não configurado");
  const url = new URL("/", base);
  url.hash = new URLSearchParams(parameters).toString();
  return url.toString();
}

function passwordResetUrl(token: string) {
  return publicUrlWithHash({ reset_token: token });
}

function invitationUrl(token: string) {
  return publicUrlWithHash({ invite_token: token });
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
  return {
    id: String(row.id), name: String(row.name), type: String(row.type), createdAt: iso(row.created_at),
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageAt: row.last_message_at ? iso(row.last_message_at) : null,
    lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null,
  };
}

function messageView(row: QueryRow) {
  return {
    id: String(row.id), channelId: String(row.channel_id), senderId: String(row.sender_id),
    senderName: String(row.sender_name), content: String(row.content), messageType: String(row.message_type),
    attachmentUrl: row.attachment_url ? String(row.attachment_url) : null, createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at ?? row.created_at), editedAt: row.edited_at ? iso(row.edited_at) : null,
    deleted: Boolean(row.deleted_at), replyTo: row.reply_to_id ? {
      id: String(row.reply_to_id), senderName: String(row.reply_sender_name ?? "Mensagem"),
      content: String(row.reply_content ?? "Mensagem indisponível"), deleted: Boolean(row.reply_deleted_at),
    } : null,
  };
}

function notificationView(row: QueryRow) {
  return {
    id: String(row.id), type: String(row.type), title: String(row.title), body: String(row.body),
    link: row.link ? String(row.link) : null, readAt: row.read_at ? iso(row.read_at) : null, createdAt: iso(row.created_at),
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
  const invitation = row.entry_type === "INVITATION";
  const active = !invitation && Boolean(row.active);
  return {
    id: String(row.id), name: String(row.name), email: String(row.email), role: String(row.role),
    jobTitle: String(row.job_title), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, active,
    status: invitation ? (new Date(String(row.expires_at)) > new Date() ? "PENDING" : "EXPIRED") : (active ? "ACTIVE" : "INACTIVE"),
    invitation,
    expiresAt: row.expires_at ? iso(row.expires_at) : null,
  };
}

function auditView(row: QueryRow) {
  let metadata: Record<string, unknown> = {};
  if (row.metadata && typeof row.metadata === "object") metadata = row.metadata as Record<string, unknown>;
  else if (typeof row.metadata === "string") {
    try { metadata = JSON.parse(row.metadata) as Record<string, unknown>; } catch { metadata = {}; }
  }
  return {
    id: String(row.id), action: String(row.action), actorName: row.actor_name ? String(row.actor_name) : null,
    targetType: String(row.target_type), targetId: row.target_id ? String(row.target_id) : null,
    metadata, createdAt: iso(row.created_at),
  };
}

function auditStatement(user: AuthenticatedUser, action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown>): DbStatement {
  return {
    text: `INSERT INTO audit_events(id, organization_id, actor_user_id, action, target_type, target_id, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    params: [randomUUID(), user.organizationId, user.id, action, targetType, targetId, JSON.stringify(metadata), new Date()],
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
  const legalVersions = acceptedLegalVersions(body);
  if (await userByEmail(email)) throw new HttpError(409, "Já existe uma conta com este e-mail");

  const now = new Date().toISOString();
  const organizationId = randomUUID();
  const userId = randomUUID();
  const organizationSlug = slugify(organizationName);
  const passwordHash = await hashPassword(password);
  const statements: DbStatement[] = [
    { text: `INSERT INTO organizations(id, name, slug, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)`, params: [organizationId, organizationName, organizationSlug, now] },
    { text: `INSERT INTO users(id, organization_id, name, email, password_hash, role, job_title, terms_accepted_at, terms_version, privacy_version, active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'OWNER',$6,$7,$8,$9,TRUE,$7,$7)`, params: [userId, organizationId, name, email, passwordHash, jobTitle, now, legalVersions.termsVersion, legalVersions.privacyVersion] },
    { text: `INSERT INTO chat_channels(id, organization_id, created_by_id, name, type, created_at, updated_at)
      VALUES ($1,$2,$3,'Geral','GROUP',$4,$4)`, params: [randomUUID(), organizationId, userId, now] },
  ];
  for (let day = 1; day <= 5; day += 1) {
    statements.push({ text: `INSERT INTO availabilities(id, owner_id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at)
      VALUES ($1,$2,$3,'09:00','18:00','America/Sao_Paulo',TRUE,$4,$4)`, params: [randomUUID(), userId, day, now] });
  }
  const user = { id: userId, organizationId, name, email, role: "OWNER" as const, jobTitle, avatarUrl: null, organizationName, organizationSlug, authVersion: 0 };
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

async function requestPasswordReset(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const email = required(body.email, "E-mail", 180).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, "Informe um e-mail válido");

  const rateKey = authenticationKey(`password-reset:${email}`, request.headers);
  const recent = await query<QueryRow>(`SELECT updated_at FROM auth_rate_limits WHERE key_hash = $1`, [rateKey]);
  const lastRequestAt = recent[0]?.updated_at ? new Date(String(recent[0].updated_at)).getTime() : 0;
  const rateLimited = Number.isFinite(lastRequestAt) && Date.now() - lastRequestAt < 60_000;
  await query(`INSERT INTO auth_rate_limits(key_hash, failures, blocked_until, updated_at)
    VALUES ($1, 0, NULL, NOW()) ON CONFLICT (key_hash) DO UPDATE SET failures = 0, blocked_until = NULL, updated_at = NOW()`, [rateKey]);
  if (rateLimited) return json(response, 202, { message: PASSWORD_RESET_RESPONSE });

  const user = await userByEmail(email);
  if (user?.active) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = secureTokenHash(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRES_MINUTES * 60_000);
    await transaction([
      { text: `UPDATE password_reset_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL`, params: [now, user.id] },
      { text: `DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day'` },
      { text: `INSERT INTO password_reset_tokens(id, user_id, token_hash, expires_at, used_at, created_at)
        VALUES ($1,$2,$3,$4,NULL,$5)`, params: [randomUUID(), user.id, tokenHash, expiresAt, now] },
    ]);
    try {
      await sendPasswordResetEmail({
        recipient: { name: user.name, email: user.email },
        resetUrl: passwordResetUrl(rawToken),
        expiresMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
      });
    } catch (error) {
      await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1`, [tokenHash]).catch(() => undefined);
      console.error("MeetFlow password reset email error", error);
    }
  }
  json(response, 202, { message: PASSWORD_RESET_RESPONSE });
}

async function resetPassword(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const token = required(body.token, "Link de recuperação", 200);
  const newPassword = required(body.newPassword, "Nova senha", 200);
  validateStrongPassword(newPassword, "A nova senha");
  const now = new Date();
  const rows = await query<QueryRow>(`WITH consumed AS (
      UPDATE password_reset_tokens SET used_at = $3
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $3
      RETURNING user_id
    )
    UPDATE users u SET password_hash = $2, auth_version = u.auth_version + 1, updated_at = $3
    FROM consumed c WHERE u.id = c.user_id AND u.active = TRUE
    RETURNING u.id`, [secureTokenHash(token), await hashPassword(newPassword), now]);
  if (!rows[0]) throw new HttpError(400, "Este link de recuperação expirou ou já foi utilizado");
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [String(rows[0].id)]);
  json(response, 200, { message: "Senha redefinida. Você já pode entrar no MeetFlow." });
}

async function invitationDetails(token: string) {
  const rows = await query<QueryRow>(`SELECT i.*, o.name AS organization_name, o.slug AS organization_slug,
    inviter.name AS invited_by_name
    FROM team_invitations i
    JOIN organizations o ON o.id = i.organization_id
    JOIN users inviter ON inviter.id = i.invited_by_id
    WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()`,
  [secureTokenHash(token)]);
  return rows[0];
}

async function inspectInvitation(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const token = required(body.token, "Convite", 200);
  const invite = await invitationDetails(token);
  if (!invite) throw new HttpError(400, "Este convite expirou, foi cancelado ou já foi utilizado");
  json(response, 200, {
    email: String(invite.email), name: String(invite.name), jobTitle: String(invite.job_title),
    role: String(invite.role), organizationName: String(invite.organization_name),
    invitedByName: String(invite.invited_by_name), expiresAt: iso(invite.expires_at),
  });
}

async function acceptInvitation(request: ApiRequest, response: ApiResponse) {
  const body = await jsonBody<UnknownBody>(request);
  const token = required(body.token, "Convite", 200);
  const password = required(body.password, "Senha", 200);
  validateStrongPassword(password);
  const legalVersions = acceptedLegalVersions(body);
  const invite = await invitationDetails(token);
  if (!invite) throw new HttpError(400, "Este convite expirou, foi cancelado ou já foi utilizado");
  const email = String(invite.email).toLowerCase();
  if (await userByEmail(email)) throw new HttpError(409, "Já existe uma conta com este e-mail");

  const now = new Date();
  const userId = randomUUID();
  const organizationId = String(invite.organization_id);
  const role = managedRole(invite.role);
  const statements: DbStatement[] = [
    { text: `UPDATE team_invitations SET accepted_at = $1, updated_at = $1
      WHERE id = $2 AND token_hash = $3 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $1`,
    params: [now, String(invite.id), secureTokenHash(token)] },
    { text: `INSERT INTO users(id, organization_id, name, email, password_hash, role, job_title, terms_accepted_at, terms_version, privacy_version, active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$8,$8)`,
    params: [userId, organizationId, String(invite.name), email, await hashPassword(password), role, String(invite.job_title), now, legalVersions.termsVersion, legalVersions.privacyVersion] },
  ];
  for (let day = 1; day <= 5; day += 1) statements.push({ text: `INSERT INTO availabilities(id, owner_id, day_of_week, start_time, end_time, timezone, active, created_at, updated_at)
    VALUES ($1,$2,$3,'09:00','18:00','America/Sao_Paulo',TRUE,$4,$4)`, params: [randomUUID(), userId, day, now] });
  statements.push({
    text: `INSERT INTO audit_events(id, organization_id, actor_user_id, action, target_type, target_id, metadata, created_at)
      VALUES ($1,$2,$3,'TEAM_INVITATION_ACCEPTED','USER',$3,$4::jsonb,$5)`,
    params: [randomUUID(), organizationId, userId, JSON.stringify({ email, role }), now],
  });
  await transaction(statements);

  const user: AuthenticatedUser = {
    id: userId, organizationId, name: String(invite.name), email, role,
    jobTitle: String(invite.job_title), avatarUrl: null,
    organizationName: String(invite.organization_name), organizationSlug: String(invite.organization_slug), authVersion: 0,
  };
  json(response, 201, { token: signToken(user, true), user: userView(user) });
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
  if (startAt <= new Date()) throw new HttpError(400, "O início da reunião deve estar no futuro");
  if (endAt <= startAt) throw new HttpError(400, "O término deve ser posterior ao início");
  const mode = required(body.mode, "Formato", 30);
  if (!new Set(["VIDEO", "IN_PERSON"]).has(mode)) throw new HttpError(400, "Formato de reunião inválido");
  const location = optional(body.location, 300);
  const notes = optional(body.notes, 2000);
  const owners = await query<QueryRow>(`SELECT id, name, email FROM users WHERE id = $1 AND organization_id = $2 AND active = TRUE`, [ownerId, user.organizationId]);
  if (!owners[0]) throw new HttpError(404, "Responsável não encontrado na empresa");
  const conflicts = await query<QueryRow>(`SELECT id FROM meetings WHERE owner_id = $1 AND status <> 'CANCELLED'
    AND start_at < $2 AND end_at > $3 LIMIT 1`, [ownerId, endAt.toISOString(), startAt.toISOString()]);
  if (conflicts[0]) throw new HttpError(409, "O responsável já possui uma reunião neste horário");

  const guests = Array.isArray(body.guests) ? body.guests.slice(0, 50) : [];
  const recipients = new Map<string, MeetingEmailRecipient>();
  const ownerEmail = String(owners[0].email).toLowerCase();
  recipients.set(ownerEmail, { name: String(owners[0].name), email: ownerEmail });
  const parsedGuests: MeetingEmailRecipient[] = [];
  for (const guestValue of guests) {
    const guest = guestValue && typeof guestValue === "object" ? guestValue as UnknownBody : {};
    const email = required(guest.email, "E-mail do convidado", 180).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, `E-mail de convidado inválido: ${email}`);
    const guestName = optional(guest.name, 120) ?? email.split("@")[0];
    if (!recipients.has(email)) {
      parsedGuests.push({ name: guestName, email });
      recipients.set(email, { name: guestName, email });
    }
  }
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const id = randomUUID();
  const statements: DbStatement[] = [{ text: `INSERT INTO meetings(id, organization_id, owner_id, created_by_id, title, start_at, end_at,
    status, mode, location, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'CONFIRMED',$8,$9,$10,$11,$11)`,
    params: [id, user.organizationId, ownerId, user.id, title, startAt, endAt, mode, location, notes, now] }];
  for (const guest of parsedGuests) {
    statements.push({ text: `INSERT INTO meeting_participants(id, meeting_id, name, email, response_status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'PENDING',$5,$5)`, params: [randomUUID(), id, guest.name, guest.email, now] });
  }
  statements.push(...meetingEmailJobStatements({
    meetingId: id,
    organizationId: user.organizationId,
    recipients: [...recipients.values()],
    startAt,
    now: nowDate,
  }));
  await transaction(statements);
  await processPendingMeetingEmailJobs({ meetingId: id, limit: 100 }).catch((error: unknown) => {
    console.error("MeetFlow meeting email processing failed", error instanceof Error ? error.message : "unknown error");
  });
  json(response, 201, meetingView((await meetingRows(user.organizationId, id))[0]));
}

async function cancelMeeting(request: ApiRequest, response: ApiResponse, organizationId: string, id: string) {
  const body = await jsonBody<UnknownBody>(request);
  const reason = required(body.reason, "Motivo", 500);
  const rows = await query<QueryRow>(`UPDATE meetings SET status = 'CANCELLED', cancellation_reason = $1, updated_at = $2
    WHERE id = $3 AND organization_id = $4 RETURNING id`, [reason, new Date().toISOString(), id, organizationId]);
  if (!rows[0]) throw new HttpError(404, "Reunião não encontrada");
  await cancelMeetingEmailJobs(id).catch((error: unknown) => {
    console.error("MeetFlow cancellation email processing failed", error instanceof Error ? error.message : "unknown error");
  });
  json(response, 200, meetingView((await meetingRows(organizationId, id))[0]));
}

async function listChannels(response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const rows = await query<QueryRow>(`SELECT c.id, c.name, c.type, c.created_at,
    COALESCE((SELECT COUNT(*) FROM chat_messages unread
      WHERE unread.channel_id = c.id AND unread.sender_id <> $2 AND unread.deleted_at IS NULL
      AND unread.created_at > COALESCE(r.last_read_at, TIMESTAMPTZ '1970-01-01')), 0) AS unread_count,
    (SELECT latest.created_at FROM chat_messages latest WHERE latest.channel_id = c.id ORDER BY latest.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT CASE WHEN latest.deleted_at IS NULL THEN LEFT(latest.content, 120) ELSE 'Mensagem excluída' END
      FROM chat_messages latest WHERE latest.channel_id = c.id ORDER BY latest.created_at DESC LIMIT 1) AS last_message_preview
    FROM chat_channels c LEFT JOIN chat_channel_reads r ON r.channel_id = c.id AND r.user_id = $2
    WHERE c.organization_id = $1 ORDER BY COALESCE((SELECT MAX(m.created_at) FROM chat_messages m WHERE m.channel_id = c.id), c.created_at) DESC`,
  [user.organizationId, user.id]);
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

async function messageRows(channelId: string, organizationId: string, messageId?: string) {
  const params: string[] = [channelId, organizationId];
  const messageFilter = messageId ? (params.push(messageId), `AND m.id = $${params.length}`) : "";
  return await query<QueryRow>(`SELECT m.id, m.channel_id, m.sender_id, sender.name AS sender_name,
    m.content, m.message_type, m.attachment_url, m.created_at, m.updated_at, m.edited_at, m.deleted_at,
    m.reply_to_id, reply.content AS reply_content, reply.deleted_at AS reply_deleted_at, reply_sender.name AS reply_sender_name
    FROM chat_messages m
    JOIN chat_channels c ON c.id = m.channel_id AND c.organization_id = $2
    JOIN users sender ON sender.id = m.sender_id
    LEFT JOIN chat_messages reply ON reply.id = m.reply_to_id
    LEFT JOIN users reply_sender ON reply_sender.id = reply.sender_id
    WHERE m.channel_id = $1 ${messageFilter} ORDER BY m.created_at`, params);
}

async function listMessages(response: ApiResponse, channelId: string, organizationId: string) {
  await channelForUser(channelId, organizationId);
  const rows = await query<QueryRow>(`SELECT * FROM (SELECT m.id, m.channel_id, m.sender_id, sender.name AS sender_name,
    m.content, m.message_type, m.attachment_url, m.created_at, m.updated_at, m.edited_at, m.deleted_at,
    m.reply_to_id, reply.content AS reply_content, reply.deleted_at AS reply_deleted_at, reply_sender.name AS reply_sender_name
    FROM chat_messages m JOIN users sender ON sender.id = m.sender_id
    LEFT JOIN chat_messages reply ON reply.id = m.reply_to_id LEFT JOIN users reply_sender ON reply_sender.id = reply.sender_id
    WHERE m.channel_id = $1 ORDER BY m.created_at DESC LIMIT 200) recent ORDER BY created_at`, [channelId]);
  json(response, 200, rows.map(messageView));
}

async function createMessage(request: ApiRequest, response: ApiResponse, channelId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await channelForUser(channelId, user.organizationId);
  const body = await jsonBody<UnknownBody>(request);
  const content = required(body.content, "Mensagem", 4000);
  const replyToId = optional(body.replyToId, 100);
  if (replyToId) {
    const reply = await query<QueryRow>(`SELECT id FROM chat_messages WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`, [replyToId, channelId]);
    if (!reply[0]) throw new HttpError(400, "A mensagem respondida não está mais disponível");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const recipients = await query<QueryRow>(`SELECT id FROM users WHERE organization_id = $1 AND active = TRUE AND id <> $2`, [user.organizationId, user.id]);
  const statements: DbStatement[] = [{
    text: `INSERT INTO chat_messages(id, channel_id, sender_id, content, message_type, reply_to_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'TEXT',$5,$6,$6)`,
    params: [id, channelId, user.id, content, replyToId, now],
  }];
  const notificationIds = recipients.map(() => randomUUID());
  recipients.forEach((recipient, index) => statements.push({
    text: `INSERT INTO notifications(id, organization_id, user_id, type, title, body, link, created_at)
      VALUES ($1,$2,$3,'CHAT_MESSAGE',$4,$5,$6,$7)`,
    params: [notificationIds[index], user.organizationId, String(recipient.id), `Nova mensagem de ${user.name}`, content.slice(0, 180), `chat:${channelId}`, now],
  }));
  await transaction(statements);
  const created = messageView((await messageRows(channelId, user.organizationId, id))[0]);
  await publishRealtime(chatChannel(user.organizationId, channelId), "chat.updated", { channelId, messageId: id, action: "created" });
  await Promise.all(recipients.map((recipient, index) => publishRealtime(
    notificationChannel(user.organizationId, String(recipient.id)), "notification.created",
    { id: notificationIds[index], type: "CHAT_MESSAGE" },
  )));
  json(response, 201, created);
}

async function updateMessage(request: ApiRequest, response: ApiResponse, channelId: string, messageId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await channelForUser(channelId, user.organizationId);
  const body = await jsonBody<UnknownBody>(request);
  const content = required(body.content, "Mensagem", 4000);
  const now = new Date();
  const rows = await query<QueryRow>(`UPDATE chat_messages SET content = $1, edited_at = $2, updated_at = $2
    WHERE id = $3 AND channel_id = $4 AND sender_id = $5 AND deleted_at IS NULL RETURNING id`,
  [content, now, messageId, channelId, user.id]);
  if (!rows[0]) throw new HttpError(404, "Mensagem não encontrada ou sem permissão para editar");
  const updated = messageView((await messageRows(channelId, user.organizationId, messageId))[0]);
  await publishRealtime(chatChannel(user.organizationId, channelId), "chat.updated", { channelId, messageId, action: "updated" });
  json(response, 200, updated);
}

async function deleteMessage(response: ApiResponse, channelId: string, messageId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await channelForUser(channelId, user.organizationId);
  const now = new Date();
  const rows = await query<QueryRow>(`UPDATE chat_messages SET content = 'Mensagem excluída', deleted_at = $1, updated_at = $1
    WHERE id = $2 AND channel_id = $3 AND deleted_at IS NULL AND (sender_id = $4 OR $5 IN ('OWNER','ADMIN')) RETURNING id`,
  [now, messageId, channelId, user.id, user.role]);
  if (!rows[0]) throw new HttpError(404, "Mensagem não encontrada ou sem permissão para excluir");
  const deleted = messageView((await messageRows(channelId, user.organizationId, messageId))[0]);
  await publishRealtime(chatChannel(user.organizationId, channelId), "chat.updated", { channelId, messageId, action: "deleted" });
  json(response, 200, deleted);
}

async function markChannelRead(response: ApiResponse, channelId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await channelForUser(channelId, user.organizationId);
  await query(`INSERT INTO chat_channel_reads(channel_id, user_id, last_read_at) VALUES ($1,$2,$3)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`, [channelId, user.id, new Date()]);
  empty(response);
}

async function listNotifications(response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const rows = await query<QueryRow>(`SELECT id, type, title, body, link, read_at, created_at FROM notifications
    WHERE user_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 60`, [user.id, user.organizationId]);
  json(response, 200, rows.map(notificationView));
}

async function markNotificationRead(response: ApiResponse, notificationId: string, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  const rows = await query<QueryRow>(`UPDATE notifications SET read_at = COALESCE(read_at, $1)
    WHERE id = $2 AND user_id = $3 AND organization_id = $4
    RETURNING id, type, title, body, link, read_at, created_at`, [new Date(), notificationId, user.id, user.organizationId]);
  if (!rows[0]) throw new HttpError(404, "Notificação não encontrada");
  json(response, 200, notificationView(rows[0]));
}

async function markAllNotificationsRead(response: ApiResponse, user: NonNullable<Awaited<ReturnType<typeof authenticated>>>) {
  await query(`UPDATE notifications SET read_at = COALESCE(read_at, $1) WHERE user_id = $2 AND organization_id = $3`, [new Date(), user.id, user.organizationId]);
  empty(response);
}

async function listStatuses(response: ApiResponse, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT s.id, s.author_id, u.name AS author_name, s.media_type, s.media_url,
    s.caption, s.created_at, s.expires_at FROM team_statuses s JOIN users u ON u.id = s.author_id
    WHERE s.organization_id = $1 AND s.expires_at > NOW() ORDER BY s.created_at DESC`, [organizationId]);
  json(response, 200, rows.map(statusView));
}

function validateStatusFile(file: UploadedFile) {
  if (!file.content.length) throw new HttpError(400, "O arquivo escolhido está vazio");
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
    AND (author_id = $3 OR $4 IN ('OWNER','ADMIN')) RETURNING media_url`, [id, user.organizationId, user.id, user.role]);
  if (!rows[0]) throw new HttpError(404, "Status não encontrado");
  const mediaUrl = rows[0].media_url ? String(rows[0].media_url) : "";
  const mediaId = mediaUrl.match(/^\/api\/public\/media\/([0-9a-f-]+)$/)?.[1];
  if (mediaId) await query(`DELETE FROM media_objects WHERE id = $1`, [mediaId]);
  empty(response);
}

async function listTeam(response: ApiResponse, organizationId: string) {
  const rows = await query<QueryRow>(`SELECT id, name, email, role, job_title, avatar_url, active,
      'USER' AS entry_type, NULL::timestamptz AS expires_at
    FROM users WHERE organization_id = $1
    UNION ALL
    SELECT id, name, email, role, job_title, NULL::varchar AS avatar_url, FALSE AS active,
      'INVITATION' AS entry_type, expires_at
    FROM team_invitations
    WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
    ORDER BY active DESC, name`, [organizationId]);
  json(response, 200, rows.map(memberView));
}

async function addTeamMember(request: ApiRequest, response: ApiResponse, user: AuthenticatedUser) {
  requireAdmin(user.role);
  const body = await jsonBody<UnknownBody>(request);
  const name = required(body.name, "Nome", 120);
  const email = required(body.email, "E-mail", 180).toLowerCase();
  const jobTitle = required(body.jobTitle, "Cargo", 120);
  const role = managedRole(body.role);
  if (!isEmail(email)) throw new HttpError(400, "Informe um e-mail válido");
  if (user.role === "ADMIN" && role === "ADMIN") throw new HttpError(403, "Somente o proprietário pode convidar outro administrador");
  if (await userByEmail(email)) throw new HttpError(409, "Já existe uma conta com este e-mail");
  const pending = await query<QueryRow>(`SELECT id FROM team_invitations WHERE organization_id = $1
    AND LOWER(email) = LOWER($2) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
  [user.organizationId, email]);
  if (pending[0]) throw new HttpError(409, "Já existe um convite pendente para este e-mail");

  const id = randomUUID();
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TEAM_INVITATION_EXPIRES_DAYS * 86_400_000);
  await transaction([
    { text: `UPDATE team_invitations SET revoked_at = $1, updated_at = $1 WHERE organization_id = $2
        AND LOWER(email) = LOWER($3) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= $1`,
    params: [now, user.organizationId, email] },
    { text: `INSERT INTO team_invitations(id, organization_id, invited_by_id, name, email, job_title, role,
        token_hash, expires_at, accepted_at, revoked_at, email_status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,'PENDING',$10,$10)`,
    params: [id, user.organizationId, user.id, name, email, jobTitle, role, secureTokenHash(rawToken), expiresAt, now] },
    auditStatement(user, "TEAM_INVITATION_CREATED", "INVITATION", id, { name, email, jobTitle, role }),
  ]);
  try {
    await sendTeamInvitationEmail({
      recipient: { name, email }, invitationUrl: invitationUrl(rawToken), organizationName: user.organizationName,
      invitedByName: user.name, roleLabel: roleLabel(role), expiresDays: TEAM_INVITATION_EXPIRES_DAYS,
    });
    await query(`UPDATE team_invitations SET email_status = 'SENT', last_sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [id]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha no envio";
    await transaction([
      { text: `UPDATE team_invitations SET email_status = 'FAILED', last_error = $1, revoked_at = NOW(), updated_at = NOW() WHERE id = $2`, params: [message, id] },
      auditStatement(user, "TEAM_INVITATION_EMAIL_FAILED", "INVITATION", id, { email }),
    ]);
    throw new HttpError(502, "Não foi possível enviar o convite agora. Tente novamente em instantes");
  }
  json(response, 201, memberView({ id, name, email, role, job_title: jobTitle, avatar_url: null, active: false, entry_type: "INVITATION", expires_at: expiresAt }));
}

async function resendTeamInvitation(response: ApiResponse, id: string, user: AuthenticatedUser) {
  requireAdmin(user.role);
  const rows = await query<QueryRow>(`SELECT i.*, o.name AS organization_name FROM team_invitations i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = $1 AND i.organization_id = $2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL`, [id, user.organizationId]);
  const invite = rows[0];
  if (!invite) throw new HttpError(404, "Convite pendente não encontrado");
  const role = managedRole(invite.role);
  if (user.role === "ADMIN" && role === "ADMIN") throw new HttpError(403, "Somente o proprietário pode reenviar este convite");
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TEAM_INVITATION_EXPIRES_DAYS * 86_400_000);
  await transaction([
    { text: `UPDATE team_invitations SET token_hash = $1, expires_at = $2, email_status = 'PENDING',
        last_error = NULL, updated_at = NOW() WHERE id = $3`, params: [secureTokenHash(rawToken), expiresAt, id] },
    auditStatement(user, "TEAM_INVITATION_RESENT", "INVITATION", id, { email: String(invite.email), role }),
  ]);
  try {
    await sendTeamInvitationEmail({
      recipient: { name: String(invite.name), email: String(invite.email) }, invitationUrl: invitationUrl(rawToken),
      organizationName: String(invite.organization_name), invitedByName: user.name,
      roleLabel: roleLabel(role), expiresDays: TEAM_INVITATION_EXPIRES_DAYS,
    });
    await query(`UPDATE team_invitations SET email_status = 'SENT', last_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha no envio";
    await query(`UPDATE team_invitations SET email_status = 'FAILED', last_error = $1, updated_at = NOW() WHERE id = $2`, [message, id]);
    throw new HttpError(502, "O convite continua pendente, mas o e-mail não pôde ser reenviado agora");
  }
  json(response, 200, memberView({ ...invite, entry_type: "INVITATION", active: false, expires_at: expiresAt }));
}

async function revokeTeamInvitation(response: ApiResponse, id: string, user: AuthenticatedUser) {
  requireAdmin(user.role);
  const rows = await query<QueryRow>(`SELECT id, email, role FROM team_invitations WHERE id = $1 AND organization_id = $2
    AND accepted_at IS NULL AND revoked_at IS NULL`, [id, user.organizationId]);
  if (!rows[0]) throw new HttpError(404, "Convite pendente não encontrado");
  const role = managedRole(rows[0].role);
  if (user.role === "ADMIN" && role === "ADMIN") throw new HttpError(403, "Somente o proprietário pode cancelar este convite");
  await transaction([
    { text: `UPDATE team_invitations SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2`, params: [id, user.organizationId] },
    auditStatement(user, "TEAM_INVITATION_REVOKED", "INVITATION", id, { email: String(rows[0].email), role }),
  ]);
  empty(response);
}

async function changeMemberRole(request: ApiRequest, response: ApiResponse, id: string, user: AuthenticatedUser) {
  requireAdmin(user.role);
  if (id === user.id) throw new HttpError(400, "Seu próprio nível de acesso não pode ser alterado por esta tela");
  const body = await jsonBody<UnknownBody>(request);
  const nextRole = managedRole(body.role);
  const rows = await query<QueryRow>(`SELECT id, name, email, role, job_title, avatar_url, active FROM users
    WHERE id = $1 AND organization_id = $2 AND active = TRUE`, [id, user.organizationId]);
  const target = rows[0];
  if (!target) throw new HttpError(404, "Colaborador não encontrado");
  const currentRole = String(target.role) as UserRole;
  if (currentRole === "OWNER") throw new HttpError(403, "O nível do proprietário não pode ser alterado");
  if (user.role === "ADMIN" && (currentRole === "ADMIN" || nextRole === "ADMIN")) {
    throw new HttpError(403, "Somente o proprietário pode administrar outros administradores");
  }
  await transaction([
    { text: `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`, params: [nextRole, id, user.organizationId] },
    auditStatement(user, "TEAM_MEMBER_ROLE_CHANGED", "USER", id, { email: String(target.email), previousRole: currentRole, role: nextRole }),
  ]);
  json(response, 200, memberView({ ...target, role: nextRole, entry_type: "USER" }));
}

async function removeTeamMember(response: ApiResponse, id: string, user: AuthenticatedUser) {
  requireAdmin(user.role);
  if (id === user.id) throw new HttpError(400, "Use a opção Excluir minha conta para desativar seu próprio acesso");
  const rows = await query<QueryRow>(`SELECT id, email, role FROM users WHERE id = $1 AND organization_id = $2 AND active = TRUE`, [id, user.organizationId]);
  const target = rows[0];
  if (!target) throw new HttpError(404, "Colaborador não encontrado");
  const targetRole = String(target.role) as UserRole;
  if (targetRole === "OWNER") throw new HttpError(403, "O proprietário da empresa não pode ser desativado");
  if (user.role === "ADMIN" && targetRole === "ADMIN") throw new HttpError(403, "Somente o proprietário pode desativar outro administrador");
  await transaction([
    { text: `UPDATE users SET active = FALSE, auth_version = auth_version + 1, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND active = TRUE`, params: [id, user.organizationId] },
    auditStatement(user, "TEAM_MEMBER_DEACTIVATED", "USER", id, { email: String(target.email), role: targetRole }),
  ]);
  empty(response);
}

async function listAuditEvents(response: ApiResponse, user: AuthenticatedUser) {
  requireAdmin(user.role);
  const rows = await query<QueryRow>(`SELECT a.*, actor.name AS actor_name FROM audit_events a
    LEFT JOIN users actor ON actor.id = a.actor_user_id
    WHERE a.organization_id = $1 ORDER BY a.created_at DESC LIMIT 60`, [user.organizationId]);
  json(response, 200, rows.map(auditView));
}

async function updatedUser(userId: string) {
  const rows = await query<QueryRow>(`SELECT u.id, u.organization_id, u.name, u.email, u.role, u.job_title, u.avatar_url, u.auth_version,
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
  if (user.role === "OWNER") {
    const others = await query<QueryRow>(`SELECT id FROM users WHERE organization_id = $1 AND id <> $2 AND active = TRUE LIMIT 1`,
      [user.organizationId, user.id]);
    if (others[0]) throw new HttpError(400, "O proprietário não pode excluir a conta enquanto houver outros colaboradores ativos");
  }
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
      return json(response, 200, { status: "ok", database: "connected", authentication: "configured", realtime: realtimeConfigured() ? "configured" : "fallback", email: emailConfigured() ? "configured" : "pending" });
    }
    if (method === "GET" && samePath(path, "cron", "email-reminders")) {
      if (!cronAuthorized(request)) throw new HttpError(401, "Rotina de lembretes não autorizada");
      return json(response, 200, await processPendingMeetingEmailJobs({ limit: 60 }));
    }
    if (method === "POST" && samePath(path, "auth", "register")) return await register(request, response);
    if (method === "POST" && samePath(path, "auth", "login")) return await login(request, response);
    if (method === "POST" && samePath(path, "auth", "forgot-password")) return await requestPasswordReset(request, response);
    if (method === "POST" && samePath(path, "auth", "reset-password")) return await resetPassword(request, response);
    if (method === "POST" && samePath(path, "auth", "invitations", "inspect")) return await inspectInvitation(request, response);
    if (method === "POST" && samePath(path, "auth", "invitations", "accept")) return await acceptInvitation(request, response);
    if (method === "GET" && samePath(path, "public", "media", "*")) return await publicMedia(response, path[2]);

    const user = await authenticated(request.headers);
    if (!user) throw new HttpError(401, "Sua sessão expirou. Entre novamente");
    if (method === "GET" && samePath(path, "auth", "me")) return json(response, 200, userView(user));
    if (method === "GET" && samePath(path, "realtime", "config")) return json(response, 200, { enabled: realtimeConfigured() });
    if (method === "GET" && samePath(path, "realtime", "token")) {
      const token = await realtimeToken(user);
      if (!token) throw new HttpError(503, "Tempo real ainda não configurado");
      return json(response, 200, token);
    }
    if (samePath(path, "meetings") && method === "GET") return await listMeetings(request, response, user.organizationId);
    if (samePath(path, "meetings") && method === "POST") return await createMeeting(request, response, user);
    if (samePath(path, "meetings", "*", "cancel") && method === "PATCH") return await cancelMeeting(request, response, user.organizationId, path[1]);
    if (samePath(path, "chat", "channels") && method === "GET") return await listChannels(response, user);
    if (samePath(path, "chat", "channels") && method === "POST") return await createChannel(request, response, user);
    if (samePath(path, "chat", "channels", "*", "messages") && method === "GET") return await listMessages(response, path[2], user.organizationId);
    if (samePath(path, "chat", "channels", "*", "messages") && method === "POST") return await createMessage(request, response, path[2], user);
    if (samePath(path, "chat", "channels", "*", "messages", "*") && method === "PATCH") return await updateMessage(request, response, path[2], path[4], user);
    if (samePath(path, "chat", "channels", "*", "messages", "*") && method === "DELETE") return await deleteMessage(response, path[2], path[4], user);
    if (samePath(path, "chat", "channels", "*", "read") && method === "POST") return await markChannelRead(response, path[2], user);
    if (samePath(path, "notifications") && method === "GET") return await listNotifications(response, user);
    if (samePath(path, "notifications", "read-all") && method === "POST") return await markAllNotificationsRead(response, user);
    if (samePath(path, "notifications", "*", "read") && method === "POST") return await markNotificationRead(response, path[1], user);
    if (samePath(path, "statuses") && method === "GET") return await listStatuses(response, user.organizationId);
    if (samePath(path, "statuses") && method === "POST") return await createStatus(request, response, user);
    if (samePath(path, "statuses", "*") && method === "DELETE") return await deleteStatus(response, path[1], user);
    if (samePath(path, "team") && method === "GET") return await listTeam(response, user.organizationId);
    if (samePath(path, "team") && method === "POST") return await addTeamMember(request, response, user);
    if (samePath(path, "team", "invitations", "*", "resend") && method === "POST") return await resendTeamInvitation(response, path[2], user);
    if (samePath(path, "team", "invitations", "*") && method === "DELETE") return await revokeTeamInvitation(response, path[2], user);
    if (samePath(path, "team", "*", "role") && method === "PATCH") return await changeMemberRole(request, response, path[1], user);
    if (samePath(path, "team", "*") && method === "DELETE") return await removeTeamMember(response, path[1], user);
    if (samePath(path, "audit-logs") && method === "GET") return await listAuditEvents(response, user);
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
