import { randomUUID } from "node:crypto";
import { query, transaction, type DbStatement } from "./db.js";
import {
  cancelScheduledMeetingEmail,
  emailConfigured,
  sendMeetingEmail,
  type MeetingEmailData,
  type MeetingEmailKind,
  type MeetingEmailRecipient,
} from "./email.js";

type QueryRow = Record<string, unknown>;

const PROVIDER_SCHEDULING_WINDOW_MS = 71 * 60 * 60 * 1000;

function jobStatement(
  meetingId: string,
  organizationId: string,
  recipient: MeetingEmailRecipient,
  kind: MeetingEmailKind,
  scheduledFor: Date,
  now: string,
): DbStatement {
  return {
    text: `INSERT INTO meeting_email_jobs(id, meeting_id, organization_id, recipient_email, recipient_name, kind,
      scheduled_for, status, attempts, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',0,$8,$8)
      ON CONFLICT (meeting_id, recipient_email, kind) DO NOTHING`,
    params: [randomUUID(), meetingId, organizationId, recipient.email.toLowerCase(), recipient.name, kind, scheduledFor, now],
  };
}

export function meetingEmailJobStatements(input: {
  meetingId: string;
  organizationId: string;
  recipients: MeetingEmailRecipient[];
  startAt: Date;
  now: Date;
}) {
  const statements: DbStatement[] = [];
  const nowIso = input.now.toISOString();
  const reminder24h = new Date(input.startAt.getTime() - 24 * 60 * 60 * 1000);
  const reminder1h = new Date(input.startAt.getTime() - 60 * 60 * 1000);
  for (const recipient of input.recipients) {
    statements.push(jobStatement(input.meetingId, input.organizationId, recipient, "CONFIRMATION", input.now, nowIso));
    if (reminder24h > input.now) statements.push(jobStatement(input.meetingId, input.organizationId, recipient, "REMINDER_24H", reminder24h, nowIso));
    if (reminder1h > input.now) statements.push(jobStatement(input.meetingId, input.organizationId, recipient, "REMINDER_1H", reminder1h, nowIso));
  }
  return statements;
}

function errorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : "Falha desconhecida no envio";
  return value.replace(/\s+/g, " ").slice(0, 480);
}

function emailData(row: QueryRow): MeetingEmailData {
  return {
    title: String(row.title),
    startAt: new Date(String(row.start_at)).toISOString(),
    endAt: new Date(String(row.end_at)).toISOString(),
    mode: String(row.mode),
    location: row.location ? String(row.location) : null,
    notes: row.notes ? String(row.notes) : null,
    ownerName: String(row.owner_name),
    organizationName: String(row.organization_name),
    cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
  };
}

async function candidateJobs(meetingId: string | undefined, limit: number) {
  const params: Array<string | number> = [limit];
  const meetingFilter = meetingId ? (params.push(meetingId), `AND j.meeting_id = $${params.length}`) : "";
  return await query<QueryRow>(`SELECT j.*, m.title, m.start_at, m.end_at, m.mode, m.location, m.notes,
    m.status AS meeting_status, m.cancellation_reason, owner.name AS owner_name, organization.name AS organization_name
    FROM meeting_email_jobs j
    JOIN meetings m ON m.id = j.meeting_id
    JOIN users owner ON owner.id = m.owner_id
    JOIN organizations organization ON organization.id = m.organization_id
    WHERE j.status = 'PENDING' ${meetingFilter}
      AND (j.kind IN ('CONFIRMATION', 'CANCELLATION') OR j.scheduled_for <= NOW() + INTERVAL '71 hours')
      AND (m.status <> 'CANCELLED' OR j.kind = 'CANCELLATION')
    ORDER BY CASE j.kind WHEN 'CANCELLATION' THEN 0 WHEN 'CONFIRMATION' THEN 1 ELSE 2 END, j.scheduled_for
    LIMIT $1`, params);
}

async function processJob(row: QueryRow) {
  const id = String(row.id);
  const claimed = await query<QueryRow>(`UPDATE meeting_email_jobs SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
    WHERE id = $1 AND status = 'PENDING' RETURNING attempts`, [id]);
  if (!claimed[0]) return "ignored" as const;
  const kind = String(row.kind) as MeetingEmailKind;
  const scheduledFor = new Date(String(row.scheduled_for));
  const reminder = kind === "REMINDER_24H" || kind === "REMINDER_1H";
  if (reminder && scheduledFor <= new Date()) {
    await query(`UPDATE meeting_email_jobs SET status = 'SKIPPED', last_error = 'Horário do lembrete já passou', updated_at = NOW() WHERE id = $1`, [id]);
    return "skipped" as const;
  }
  try {
    const providerMessageId = await sendMeetingEmail({
      recipient: { name: String(row.recipient_name), email: String(row.recipient_email) },
      meeting: emailData(row),
      kind,
      scheduledAt: reminder ? scheduledFor.toISOString() : undefined,
    });
    await query(`UPDATE meeting_email_jobs SET status = $1, provider_message_id = $2, last_error = NULL, updated_at = NOW()
      WHERE id = $3`, [reminder ? "SCHEDULED" : "SENT", providerMessageId, id]);
    return reminder ? "scheduled" as const : "sent" as const;
  } catch (error) {
    const attempts = Number(claimed[0].attempts ?? 1);
    const retry = attempts < 3 && (!reminder || scheduledFor.getTime() > Date.now() + 10 * 60 * 1000);
    await query(`UPDATE meeting_email_jobs SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
      [retry ? "PENDING" : "FAILED", errorMessage(error), id]);
    return "failed" as const;
  }
}

async function cancelProviderRemindersForCancelledMeetings(meetingId?: string) {
  const params: string[] = [];
  const meetingFilter = meetingId ? (params.push(meetingId), `AND j.meeting_id = $${params.length}`) : "";
  const scheduled = await query<QueryRow>(`SELECT j.id, j.provider_message_id
    FROM meeting_email_jobs j JOIN meetings m ON m.id = j.meeting_id
    WHERE j.status = 'SCHEDULED' AND j.provider_message_id IS NOT NULL AND m.status = 'CANCELLED'
    ${meetingFilter} ORDER BY j.updated_at LIMIT 60`, params);
  const results = await Promise.all(scheduled.map(async (job) => {
    const id = String(job.id);
    try {
      await cancelScheduledMeetingEmail(String(job.provider_message_id));
      await query(`UPDATE meeting_email_jobs SET status = 'CANCELLED', last_error = NULL, updated_at = NOW() WHERE id = $1`, [id]);
      return true;
    } catch (error) {
      await query(`UPDATE meeting_email_jobs SET last_error = $1, updated_at = NOW() WHERE id = $2`, [errorMessage(error), id]);
      return false;
    }
  }));
  return { processed: results.length, cancelled: results.filter(Boolean).length };
}

export async function processPendingMeetingEmailJobs(input: { meetingId?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(input.limit ?? 40, 100));
  if (!emailConfigured()) {
    if (input.meetingId) {
      await query(`UPDATE meeting_email_jobs SET status = 'SKIPPED', last_error = 'Serviço de e-mail ainda não configurado', updated_at = NOW()
        WHERE meeting_id = $1 AND status = 'PENDING' AND kind IN ('CONFIRMATION', 'CANCELLATION')`, [input.meetingId]);
    }
    return { configured: false, processed: 0, sent: 0, scheduled: 0, failed: 0, skipped: 0 };
  }
  await cancelProviderRemindersForCancelledMeetings(input.meetingId);
  await query(`UPDATE meeting_email_jobs SET status = 'PENDING', updated_at = NOW()
    WHERE status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '15 minutes'`);
  const jobs = await candidateJobs(input.meetingId, limit);
  const results = await Promise.all(jobs.map((job) => processJob(job)));
  return {
    configured: true,
    processed: results.length,
    sent: results.filter((result) => result === "sent").length,
    scheduled: results.filter((result) => result === "scheduled").length,
    failed: results.filter((result) => result === "failed").length,
    skipped: results.filter((result) => result === "skipped").length,
  };
}

export async function cancelMeetingEmailJobs(meetingId: string) {
  const recipients = await query<QueryRow>(`SELECT DISTINCT recipient_email, recipient_name, organization_id
    FROM meeting_email_jobs WHERE meeting_id = $1`, [meetingId]);
  const now = new Date();
  const statements: DbStatement[] = [{
    text: `UPDATE meeting_email_jobs SET status = 'CANCELLED', updated_at = $2
      WHERE meeting_id = $1 AND kind <> 'CANCELLATION' AND status IN ('PENDING', 'PROCESSING')`,
    params: [meetingId, now],
  }];
  for (const recipient of recipients) {
    statements.push(jobStatement(meetingId, String(recipient.organization_id), {
      name: String(recipient.recipient_name),
      email: String(recipient.recipient_email),
    }, "CANCELLATION", now, now.toISOString()));
  }
  await transaction(statements);
  return await processPendingMeetingEmailJobs({ meetingId, limit: 100 });
}

export function reminderSchedulingWindowMs() {
  return PROVIDER_SCHEDULING_WINDOW_MS;
}
