package com.meetflow.meeting;

import com.meetflow.common.BusinessException;
import com.meetflow.common.NotFoundException;
import com.meetflow.domain.*;
import com.meetflow.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MeetingService {
    private final MeetingRepository meetingRepository;
    private final MeetingParticipantRepository participantRepository;
    private final MeetingTypeRepository typeRepository;
    private final UserRepository userRepository;
    private final AvailabilityRepository availabilityRepository;
    private final NotificationService notificationService;

    @Transactional(readOnly = true)
    public List<MeetingDtos.MeetingView> list(AppUser user, OffsetDateTime from, OffsetDateTime to) {
        return meetingRepository.findAllByOrganizationIdAndStartAtBetweenOrderByStartAt(user.getOrganization().getId(), from, to)
                .stream().map(this::view).toList();
    }

    @Transactional
    public MeetingDtos.MeetingView create(AppUser actor, MeetingDtos.CreateMeetingRequest request) {
        validateRange(request.startAt(), request.endAt());
        AppUser owner = request.ownerId() == null ? actor : userRepository.findById(request.ownerId()).orElseThrow(() -> new NotFoundException("Responsável não encontrado"));
        assertSameOrganization(actor, owner);
        ensureAvailable(owner.getId(), request.startAt(), request.endAt());

        Meeting meeting = new Meeting();
        meeting.setOrganization(actor.getOrganization());
        meeting.setOwner(owner);
        meeting.setCreatedBy(actor);
        meeting.setTitle(request.title().trim());
        meeting.setStartAt(request.startAt());
        meeting.setEndAt(request.endAt());
        meeting.setMode(request.mode() == null ? "VIDEO" : request.mode());
        meeting.setLocation(request.location());
        meeting.setNotes(request.notes());
        if (request.meetingTypeId() != null) meeting.setMeetingType(typeRepository.findById(request.meetingTypeId()).orElseThrow(() -> new NotFoundException("Tipo de reunião não encontrado")));
        meeting = meetingRepository.save(meeting);
        saveGuestsAndNotify(meeting, request.guests() == null ? List.of() : request.guests());
        return view(meeting);
    }

    @Transactional
    public MeetingDtos.MeetingView cancel(AppUser actor, UUID meetingId, String reason) {
        Meeting meeting = meetingRepository.findByIdAndOrganizationId(meetingId, actor.getOrganization().getId())
                .orElseThrow(() -> new NotFoundException("Reunião não encontrada"));
        if (meeting.getStatus() == MeetingStatus.CANCELLED) throw new BusinessException("Esta reunião já foi cancelada");
        meeting.setStatus(MeetingStatus.CANCELLED);
        meeting.setCancellationReason(reason);
        return view(meetingRepository.save(meeting));
    }

    @Transactional(readOnly = true)
    public List<MeetingDtos.TypeView> listTypes(AppUser user) {
        return typeRepository.findAllByOrganizationIdAndActiveTrue(user.getOrganization().getId()).stream().map(this::typeView).toList();
    }

    @Transactional
    public MeetingDtos.TypeView createType(AppUser user, MeetingDtos.CreateTypeRequest request) {
        MeetingType type = new MeetingType();
        type.setOrganization(user.getOrganization());
        type.setOwner(user);
        type.setTitle(request.title().trim());
        type.setDescription(request.description());
        type.setDurationMinutes(request.durationMinutes());
        type.setColor(request.color() == null ? "#7257E8" : request.color());
        type.setLocationMode(request.locationMode() == null ? "VIDEO" : request.locationMode());
        type.setPublicSlug(uniquePublicSlug(user.getOrganization().getSlug() + "-" + request.title()));
        return typeView(typeRepository.save(type));
    }

    @Transactional
    public MeetingDtos.MeetingView publicBook(String slug, MeetingDtos.PublicBookingRequest request) {
        MeetingType type = typeRepository.findByPublicSlugAndActiveTrue(slug).orElseThrow(() -> new NotFoundException("Link de agendamento não encontrado"));
        OffsetDateTime end = request.startAt().plusMinutes(type.getDurationMinutes());
        ensureWithinAvailability(type.getOwner(), request.startAt(), end);
        ensureAvailable(type.getOwner().getId(), request.startAt(), end);
        Meeting meeting = new Meeting();
        meeting.setOrganization(type.getOrganization());
        meeting.setMeetingType(type);
        meeting.setOwner(type.getOwner());
        meeting.setCreatedBy(type.getOwner());
        meeting.setTitle(type.getTitle());
        meeting.setStartAt(request.startAt());
        meeting.setEndAt(end);
        meeting.setMode(type.getLocationMode());
        meeting.setNotes(request.notes());
        meeting = meetingRepository.save(meeting);
        saveGuestsAndNotify(meeting, List.of(new MeetingDtos.Guest(request.guestName(), request.guestEmail())));
        return view(meeting);
    }

    @Transactional(readOnly = true)
    public MeetingDtos.TypeView publicType(String slug) {
        return typeView(typeRepository.findByPublicSlugAndActiveTrue(slug).orElseThrow(() -> new NotFoundException("Link de agendamento não encontrado")));
    }

    @Transactional(readOnly = true)
    public List<OffsetDateTime> publicSlots(String slug, LocalDate date) {
        MeetingType type = typeRepository.findByPublicSlugAndActiveTrue(slug).orElseThrow(() -> new NotFoundException("Link de agendamento não encontrado"));
        List<OffsetDateTime> slots = new java.util.ArrayList<>();
        for (Availability availability : availabilityRepository.findAllByOwnerIdAndActiveTrueOrderByDayOfWeekAscStartTimeAsc(type.getOwner().getId())) {
            if (availability.getDayOfWeek() != date.getDayOfWeek().getValue()) continue;
            ZoneId zone = ZoneId.of(availability.getTimezone());
            ZonedDateTime cursor = ZonedDateTime.of(date, availability.getStartTime(), zone);
            ZonedDateTime limit = ZonedDateTime.of(date, availability.getEndTime(), zone);
            while (!cursor.plusMinutes(type.getDurationMinutes()).isAfter(limit)) {
                OffsetDateTime start = cursor.toOffsetDateTime();
                OffsetDateTime end = cursor.plusMinutes(type.getDurationMinutes()).toOffsetDateTime();
                if (!meetingRepository.hasConflict(type.getOwner().getId(), start, end, List.of(MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED))) slots.add(start);
                cursor = cursor.plusMinutes(type.getDurationMinutes());
            }
        }
        return slots;
    }

    @Transactional
    public MeetingDtos.AvailabilityView addAvailability(AppUser user, MeetingDtos.AvailabilityRequest request) {
        if (!request.endTime().isAfter(request.startTime())) throw new BusinessException("O horário final deve ser maior que o inicial");
        Availability availability = new Availability();
        availability.setOwner(user);
        availability.setDayOfWeek(request.dayOfWeek());
        availability.setStartTime(request.startTime());
        availability.setEndTime(request.endTime());
        availability.setTimezone(request.timezone());
        return availabilityView(availabilityRepository.save(availability));
    }

    @Transactional(readOnly = true)
    public List<MeetingDtos.AvailabilityView> listAvailability(AppUser user) {
        return availabilityRepository.findAllByOwnerIdAndActiveTrueOrderByDayOfWeekAscStartTimeAsc(user.getId()).stream().map(this::availabilityView).toList();
    }

    private void ensureAvailable(UUID ownerId, OffsetDateTime startAt, OffsetDateTime endAt) {
        if (meetingRepository.hasConflict(ownerId, startAt, endAt, List.of(MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED)))
            throw new BusinessException("Este horário não está mais disponível");
    }

    private void ensureWithinAvailability(AppUser owner, OffsetDateTime startAt, OffsetDateTime endAt) {
        List<Availability> options = availabilityRepository.findAllByOwnerIdAndActiveTrueOrderByDayOfWeekAscStartTimeAsc(owner.getId());
        boolean allowed = options.stream().anyMatch(option -> {
            ZoneId zone = ZoneId.of(option.getTimezone());
            ZonedDateTime localStart = startAt.atZoneSameInstant(zone);
            ZonedDateTime localEnd = endAt.atZoneSameInstant(zone);
            return localStart.getDayOfWeek().getValue() == option.getDayOfWeek()
                    && localEnd.toLocalDate().equals(localStart.toLocalDate())
                    && !localStart.toLocalTime().isBefore(option.getStartTime())
                    && !localEnd.toLocalTime().isAfter(option.getEndTime());
        });
        if (!allowed) throw new BusinessException("O horário escolhido está fora da disponibilidade do responsável");
    }

    private void validateRange(OffsetDateTime startAt, OffsetDateTime endAt) {
        if (!endAt.isAfter(startAt)) throw new BusinessException("O término deve ser posterior ao início");
    }

    private void assertSameOrganization(AppUser actor, AppUser user) {
        if (!actor.getOrganization().getId().equals(user.getOrganization().getId())) throw new BusinessException("O responsável não pertence à sua empresa");
    }

    private void saveGuestsAndNotify(Meeting meeting, List<MeetingDtos.Guest> guests) {
        for (MeetingDtos.Guest guest : guests) {
            MeetingParticipant participant = new MeetingParticipant();
            participant.setMeeting(meeting);
            participant.setName(guest.name());
            participant.setEmail(guest.email().toLowerCase(Locale.ROOT));
            participantRepository.save(participant);
            notificationService.sendMeetingConfirmation(participant.getEmail(), participant.getName(), meeting.getTitle(), meeting.getStartAt().format(DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm")));
        }
    }

    private MeetingDtos.MeetingView view(Meeting meeting) {
        List<MeetingDtos.Guest> guests = participantRepository.findAllByMeetingId(meeting.getId()).stream().map(p -> new MeetingDtos.Guest(p.getName(), p.getEmail())).toList();
        return new MeetingDtos.MeetingView(meeting.getId(), meeting.getTitle(), meeting.getStartAt(), meeting.getEndAt(), meeting.getStatus(), meeting.getMode(), meeting.getLocation(), meeting.getOwner().getId(), meeting.getOwner().getName(), guests);
    }

    private MeetingDtos.TypeView typeView(MeetingType type) {
        return new MeetingDtos.TypeView(type.getId(), type.getTitle(), type.getDescription(), type.getDurationMinutes(), type.getPublicSlug(), type.getColor(), type.getLocationMode(), type.getOwner().getName());
    }

    private MeetingDtos.AvailabilityView availabilityView(Availability value) {
        return new MeetingDtos.AvailabilityView(value.getId(), value.getDayOfWeek(), value.getStartTime(), value.getEndTime(), value.getTimezone());
    }

    private String uniquePublicSlug(String value) {
        String base = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        String result = base + "-" + UUID.randomUUID().toString().substring(0, 6);
        while (typeRepository.existsByPublicSlug(result)) result = base + "-" + UUID.randomUUID().toString().substring(0, 6);
        return result;
    }
}
