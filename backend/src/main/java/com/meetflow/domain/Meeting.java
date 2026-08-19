package com.meetflow.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@Table(name = "meetings", indexes = @Index(name = "idx_meeting_owner_start", columnList = "owner_id,start_at"))
public class Meeting extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_type_id")
    private MeetingType meetingType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by_id", nullable = false)
    private AppUser createdBy;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(name = "start_at", nullable = false)
    private OffsetDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private OffsetDateTime endAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MeetingStatus status = MeetingStatus.SCHEDULED;

    @Column(nullable = false, length = 30)
    private String mode = "VIDEO";

    @Column(length = 300)
    private String location;

    @Column(length = 2000)
    private String notes;

    @Column(name = "cancellation_reason", length = 500)
    private String cancellationReason;
}
