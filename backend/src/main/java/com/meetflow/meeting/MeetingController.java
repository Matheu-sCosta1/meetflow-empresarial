package com.meetflow.meeting;

import com.meetflow.domain.AppUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MeetingController {
    private final MeetingService meetingService;

    @GetMapping("/meetings")
    List<MeetingDtos.MeetingView> list(@AuthenticationPrincipal AppUser user,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) { return meetingService.list(user, from, to); }

    @PostMapping("/meetings") @ResponseStatus(HttpStatus.CREATED)
    MeetingDtos.MeetingView create(@AuthenticationPrincipal AppUser user, @Valid @RequestBody MeetingDtos.CreateMeetingRequest request) { return meetingService.create(user, request); }

    @PatchMapping("/meetings/{id}/cancel")
    MeetingDtos.MeetingView cancel(@AuthenticationPrincipal AppUser user, @PathVariable UUID id, @Valid @RequestBody MeetingDtos.CancelRequest request) { return meetingService.cancel(user, id, request.reason()); }

    @GetMapping("/meeting-types")
    List<MeetingDtos.TypeView> types(@AuthenticationPrincipal AppUser user) { return meetingService.listTypes(user); }

    @PostMapping("/meeting-types") @ResponseStatus(HttpStatus.CREATED)
    MeetingDtos.TypeView createType(@AuthenticationPrincipal AppUser user, @Valid @RequestBody MeetingDtos.CreateTypeRequest request) { return meetingService.createType(user, request); }

    @GetMapping("/availability")
    List<MeetingDtos.AvailabilityView> availability(@AuthenticationPrincipal AppUser user) { return meetingService.listAvailability(user); }

    @PostMapping("/availability") @ResponseStatus(HttpStatus.CREATED)
    MeetingDtos.AvailabilityView availability(@AuthenticationPrincipal AppUser user, @Valid @RequestBody MeetingDtos.AvailabilityRequest request) { return meetingService.addAvailability(user, request); }
}
