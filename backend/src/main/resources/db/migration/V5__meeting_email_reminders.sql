CREATE TABLE IF NOT EXISTS meeting_email_jobs (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_email VARCHAR(180) NOT NULL,
    recipient_name VARCHAR(120) NOT NULL,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_1H', 'CANCELLATION')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    provider_message_id VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SCHEDULED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(meeting_id, recipient_email, kind)
);

CREATE INDEX IF NOT EXISTS idx_meeting_email_jobs_pending ON meeting_email_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_meeting_email_jobs_meeting ON meeting_email_jobs(meeting_id);
