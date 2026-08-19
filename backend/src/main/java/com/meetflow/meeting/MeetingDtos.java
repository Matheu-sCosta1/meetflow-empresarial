package com.meetflow.meeting;

import com.meetflow.domain.MeetingStatus;
import jakarta.validation.constraints.*;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MeetingDtos {
    private MeetingDtos() {}

    public record Guest(@NotBlank @Size(max = 120) String name, @NotBlank @Email String email) {}
    public record CreateMeetingRequest(UUID meetingTypeId, UUID ownerId, @NotBlank @Size(max = 160) String title,
                                       @NotNull OffsetDateTime startAt, @NotNull OffsetDateTime endAt,
                                       @Size(max = 30) String mode, @Size(max = 300) String location,
                                       @Size(max = 2000) String notes, List<Guest> guests) {}
    public record CancelRequest(@NotBlank @Size(max = 500) String reason) {}
    public record MeetingView(UUID id, String title, OffsetDateTime startAt, OffsetDateTime endAt,
                              MeetingStatus status, String mode, String location, UUID ownerId,
                              String ownerName, List<Guest> participants) {}

    public record CreateTypeRequest(@NotBlank @Size(max = 120) String title, @Size(max = 500) String description,
                                    @Min(10) @Max(480) int durationMinutes, @Size(max = 20) String color,
                                    @Size(max = 30) String locationMode) {}
    public record TypeView(UUID id, String title, String description, int durationMinutes, String publicSlug,
                           String color, String locationMode, String ownerName) {}

    public record AvailabilityRequest(@Min(1) @Max(7) int dayOfWeek, @NotNull LocalTime startTime,
                                      @NotNull LocalTime endTime, @NotBlank String timezone) {}
    public record AvailabilityView(UUID id, int dayOfWeek, LocalTime startTime, LocalTime endTime, String timezone) {}

    public record PublicBookingRequest(@NotBlank @Size(max = 120) String guestName, @NotBlank @Email String guestEmail,
                                       @NotNull OffsetDateTime startAt, @Size(max = 1000) String notes) {}
}
