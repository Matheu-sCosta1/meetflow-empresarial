import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");
const email = await readFile(new URL("../vercel-api/email.ts", import.meta.url), "utf8");
const jobs = await readFile(new URL("../vercel-api/meeting-emails.ts", import.meta.url), "utf8");
const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

test("keeps Brevo credentials exclusively on the server", () => {
  assert.match(email, /process\.env\.BREVO_API_KEY/);
  assert.match(email, /process\.env\.MEETFLOW_EMAIL_FROM/);
  assert.doesNotMatch(dashboard, /BREVO_API_KEY|MEETFLOW_EMAIL_FROM/);
  assert.doesNotMatch(email, /NEXT_PUBLIC_/);
});

test("queues confirmation plus 24-hour and 1-hour reminders", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS meeting_email_jobs/);
  assert.match(jobs, /"CONFIRMATION"/);
  assert.match(jobs, /"REMINDER_24H"/);
  assert.match(jobs, /"REMINDER_1H"/);
  assert.match(jobs, /24 \* 60 \* 60 \* 1000/);
  assert.match(jobs, /60 \* 60 \* 1000/);
});

test("emails only the responsible person and explicitly added invitees", () => {
  assert.match(router, /recipients\.set\(ownerEmail/);
  assert.match(router, /Array\.isArray\(body\.guests\)/);
  assert.match(router, /const recipients = new Map<string, MeetingEmailRecipient>/);
  assert.match(dashboard, /Quem receberá os avisos\?/);
  assert.match(dashboard, /Responsável · aviso automático/);
});

test("cancels provider reminders and sends a cancellation notice", () => {
  assert.match(email, /cancelScheduledMeetingEmail/);
  assert.match(jobs, /status = 'CANCELLED'/);
  assert.match(jobs, /cancelProviderRemindersForCancelledMeetings/);
  assert.match(jobs, /last_error = \$1/);
  assert.match(jobs, /"CANCELLATION"/);
  assert.match(router, /cancelMeetingEmailJobs\(id\)\.catch/);
});

test("runs a protected daily reminder task", () => {
  assert.deepEqual(config.crons, [{ path: "/api/cron/email-reminders", schedule: "0 9 * * *" }]);
  assert.match(router, /CRON_SECRET/);
  assert.match(router, /timingSafeEqual/);
  assert.match(router, /samePath\(path, "cron", "email-reminders"\)/);
});

test("meeting creation remains successful when email delivery fails", () => {
  assert.match(router, /processPendingMeetingEmailJobs[\s\S]+\.catch/);
  assert.match(router, /json\(response, 201/);
  assert.match(email, /BREVO_SANDBOX/);
  assert.match(email, /AbortSignal\.timeout\(3_500\)/);
  assert.match(router, /O início da reunião deve estar no futuro/);
});
