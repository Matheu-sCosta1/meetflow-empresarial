export type MeetingEmailKind = "CONFIRMATION" | "REMINDER_24H" | "REMINDER_1H" | "CANCELLATION";

export type MeetingEmailRecipient = {
  name: string;
  email: string;
};

export type MeetingEmailData = {
  title: string;
  startAt: string;
  endAt: string;
  mode: string;
  location: string | null;
  notes: string | null;
  ownerName: string;
  organizationName: string;
  cancellationReason?: string | null;
};

type BrevoResponse = { messageId?: string };

const TIME_ZONE = "America/Sao_Paulo";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

function calendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function emailCopy(kind: MeetingEmailKind, meeting: MeetingEmailData) {
  if (kind === "REMINDER_24H") return {
    eyebrow: "LEMBRETE DE REUNIÃO",
    subject: `Lembrete: ${meeting.title} começa em 24 horas`,
    heading: "Sua reunião começa em 24 horas",
    introduction: "Este é um lembrete automático para você se preparar para o compromisso abaixo.",
  };
  if (kind === "REMINDER_1H") return {
    eyebrow: "COMEÇA EM BREVE",
    subject: `Lembrete: ${meeting.title} começa em 1 hora`,
    heading: "Sua reunião começa em 1 hora",
    introduction: "A reunião está próxima. Confira o horário e o local de acesso.",
  };
  if (kind === "CANCELLATION") return {
    eyebrow: "REUNIÃO CANCELADA",
    subject: `Reunião cancelada: ${meeting.title}`,
    heading: "Esta reunião foi cancelada",
    introduction: "O compromisso abaixo não acontecerá mais. Você pode desconsiderar os lembretes anteriores.",
  };
  return {
    eyebrow: "REUNIÃO CONFIRMADA",
    subject: `Reunião confirmada: ${meeting.title}`,
    heading: "Sua participação foi registrada",
    introduction: "Você foi incluído nesta reunião e receberá lembretes por e-mail antes do horário marcado.",
  };
}

function calendarUrl(meeting: MeetingEmailData) {
  const details = [meeting.notes, `Responsável: ${meeting.ownerName}`].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${calendarDate(meeting.startAt)}/${calendarDate(meeting.endAt)}`,
    details,
    location: meeting.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderEmail(recipient: MeetingEmailRecipient, meeting: MeetingEmailData, kind: MeetingEmailKind) {
  const copy = emailCopy(kind, meeting);
  const cancelled = kind === "CANCELLATION";
  const location = meeting.location || (meeting.mode === "VIDEO" ? "Link de videoconferência a confirmar" : "Local a confirmar");
  const reason = cancelled && meeting.cancellationReason ? `\nMotivo: ${meeting.cancellationReason}` : "";
  const notes = meeting.notes ? `\nObservações: ${meeting.notes}` : "";
  const textContent = `Olá, ${recipient.name}.\n\n${copy.heading}\n${copy.introduction}\n\nReunião: ${meeting.title}\nInício: ${dateTime(meeting.startAt)}\nTérmino: ${dateTime(meeting.endAt)}\nResponsável: ${meeting.ownerName}\nLocal ou link: ${location}${notes}${reason}\n\nEnviado pelo MeetFlow para ${meeting.organizationName}.`;
  const action = cancelled ? "" : `<a href="${escapeHtml(calendarUrl(meeting))}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Adicionar ao Google Agenda</a>`;
  const reasonBlock = cancelled && meeting.cancellationReason
    ? `<div style="margin-top:18px;padding:14px 16px;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px"><strong style="color:#9f1239">Motivo do cancelamento</strong><p style="margin:6px 0 0;color:#4c0519">${escapeHtml(meeting.cancellationReason)}</p></div>`
    : "";
  const notesBlock = meeting.notes
    ? `<div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border-radius:10px"><strong style="color:#334155">Observações</strong><p style="margin:6px 0 0;color:#475569;white-space:pre-line">${escapeHtml(meeting.notes)}</p></div>`
    : "";
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)"><tr><td style="height:7px;background:${cancelled ? "#e11d48" : "#2563eb"}"></td></tr><tr><td style="padding:32px"><div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:${cancelled ? "#be123c" : "#2563eb"}">${copy.eyebrow}</div><h1 style="margin:10px 0 8px;font-size:27px;line-height:1.2">${escapeHtml(copy.heading)}</h1><p style="margin:0 0 24px;color:#475569;line-height:1.6">Olá, ${escapeHtml(recipient.name)}. ${escapeHtml(copy.introduction)}</p><div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px"><h2 style="margin:0 0 16px;font-size:21px">${escapeHtml(meeting.title)}</h2><p style="margin:8px 0"><strong>Início:</strong> ${escapeHtml(dateTime(meeting.startAt))}</p><p style="margin:8px 0"><strong>Término:</strong> ${escapeHtml(dateTime(meeting.endAt))}</p><p style="margin:8px 0"><strong>Responsável:</strong> ${escapeHtml(meeting.ownerName)}</p><p style="margin:8px 0"><strong>Local ou link:</strong> ${escapeHtml(location)}</p>${notesBlock}${reasonBlock}</div><div style="margin-top:24px">${action}</div><p style="margin:28px 0 0;color:#64748b;font-size:13px;line-height:1.5">Enviado pelo MeetFlow em nome de ${escapeHtml(meeting.organizationName)}. Este é um aviso automático sobre uma reunião em que seu e-mail foi incluído.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: copy.subject, textContent, htmlContent };
}

export function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.MEETFLOW_EMAIL_FROM?.trim());
}

export async function sendMeetingEmail(input: {
  recipient: MeetingEmailRecipient;
  meeting: MeetingEmailData;
  kind: MeetingEmailKind;
  scheduledAt?: string;
}) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.MEETFLOW_EMAIL_FROM?.trim();
  if (!apiKey || !senderEmail) throw new Error("Serviço de e-mail não configurado");
  const content = renderEmail(input.recipient, input.meeting, input.kind);
  const payload: Record<string, unknown> = {
    sender: { name: process.env.MEETFLOW_EMAIL_NAME?.trim() || "MeetFlow", email: senderEmail },
    to: [{ name: input.recipient.name, email: input.recipient.email }],
    subject: content.subject,
    textContent: content.textContent,
    htmlContent: content.htmlContent,
  };
  if (input.scheduledAt) payload.scheduledAt = input.scheduledAt;
  if (process.env.BREVO_SANDBOX?.trim().toLowerCase() === "true") {
    payload.headers = { "X-Sib-Sandbox": "drop" };
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3_500),
  });
  const result = await response.json().catch(() => ({})) as BrevoResponse & { message?: string };
  if (!response.ok || !result.messageId) {
    throw new Error(`Brevo recusou o envio (${response.status})${result.message ? `: ${result.message.slice(0, 180)}` : ""}`);
  }
  return result.messageId;
}

export async function cancelScheduledMeetingEmail(messageId: string) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return false;
  const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(3_500),
  });
  if (response.ok || response.status === 404) return true;
  throw new Error(`Brevo recusou o cancelamento (${response.status})`);
}
