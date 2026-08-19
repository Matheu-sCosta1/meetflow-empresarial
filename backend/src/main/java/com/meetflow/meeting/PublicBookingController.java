package com.meetflow.meeting;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/public/meeting-types")
@RequiredArgsConstructor
public class PublicBookingController {
    private final MeetingService meetingService;

    @GetMapping("/{slug}")
    MeetingDtos.TypeView type(@PathVariable String slug) { return meetingService.publicType(slug); }

    @GetMapping("/{slug}/slots")
    List<OffsetDateTime> slots(@PathVariable String slug,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) { return meetingService.publicSlots(slug, date); }

    @PostMapping("/{slug}/book") @ResponseStatus(HttpStatus.CREATED)
    MeetingDtos.MeetingView book(@PathVariable String slug, @Valid @RequestBody MeetingDtos.PublicBookingRequest request) { return meetingService.publicBook(slug, request); }
}
