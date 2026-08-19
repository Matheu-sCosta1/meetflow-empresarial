package com.meetflow.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Getter
@Setter
@NoArgsConstructor
@Table(name = "meeting_types")
public class MeetingType extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(length = 500)
    private String description;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes = 30;

    @Column(name = "public_slug", nullable = false, unique = true, length = 100)
    private String publicSlug;

    @Column(nullable = false, length = 20)
    private String color = "#7257E8";

    @Column(name = "location_mode", nullable = false, length = 30)
    private String locationMode = "VIDEO";

    @Column(nullable = false)
    private boolean active = true;
}
