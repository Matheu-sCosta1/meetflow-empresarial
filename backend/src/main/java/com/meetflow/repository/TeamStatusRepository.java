package com.meetflow.repository;

import com.meetflow.domain.TeamStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface TeamStatusRepository extends JpaRepository<TeamStatus, UUID> {
    List<TeamStatus> findAllByOrganizationIdAndExpiresAtAfterOrderByCreatedAtDesc(UUID organizationId, Instant now);
    List<TeamStatus> findAllByExpiresAtBefore(Instant instant);
}
