package com.meetflow.repository;

import com.meetflow.domain.MeetingParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MeetingParticipantRepository extends JpaRepository<MeetingParticipant, UUID> {
    List<MeetingParticipant> findAllByMeetingId(UUID meetingId);
}
