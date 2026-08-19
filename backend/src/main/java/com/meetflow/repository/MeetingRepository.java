package com.meetflow.repository;

import com.meetflow.domain.Meeting;
import com.meetflow.domain.MeetingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MeetingRepository extends JpaRepository<Meeting, UUID> {
    List<Meeting> findAllByOrganizationIdAndStartAtBetweenOrderByStartAt(UUID organizationId, OffsetDateTime from, OffsetDateTime to);
    Optional<Meeting> findByIdAndOrganizationId(UUID id, UUID organizationId);

    @Query("""
        select count(m) > 0 from Meeting m
        where m.owner.id = :ownerId
          and m.status in :statuses
          and m.startAt < :endAt
          and m.endAt > :startAt
        """)
    boolean hasConflict(@Param("ownerId") UUID ownerId, @Param("startAt") OffsetDateTime startAt,
                        @Param("endAt") OffsetDateTime endAt, @Param("statuses") Collection<MeetingStatus> statuses);
}
