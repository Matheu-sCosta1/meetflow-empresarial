package com.meetflow.status;

import com.meetflow.domain.MediaType;

import java.time.Instant;
import java.util.UUID;

public final class StatusDtos {
    private StatusDtos() {}
    public record StatusView(UUID id, UUID authorId, String authorName, MediaType mediaType, String mediaUrl,
                             String caption, Instant createdAt, Instant expiresAt) {}
}
