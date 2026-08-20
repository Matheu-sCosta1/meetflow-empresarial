CREATE TABLE media_objects (
    id UUID PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    original_name VARCHAR(255),
    size_bytes BIGINT NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
