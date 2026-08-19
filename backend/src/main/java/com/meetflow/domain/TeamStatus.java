package com.meetflow.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Getter
@Setter
@NoArgsConstructor
@Table(name = "team_statuses", indexes = @Index(name = "idx_status_org_expiry", columnList = "organization_id,expires_at"))
public class TeamStatus extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private AppUser author;

    @Enumerated(EnumType.STRING)
    @Column(name = "media_type", nullable = false, length = 20)
    private MediaType mediaType;

    @Column(name = "media_url", length = 500)
    private String mediaUrl;

    @Column(length = 1000)
    private String caption;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
