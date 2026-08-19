package com.meetflow.repository;

import com.meetflow.domain.MeetingType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MeetingTypeRepository extends JpaRepository<MeetingType, UUID> {
    List<MeetingType> findAllByOrganizationIdAndActiveTrue(UUID organizationId);
    Optional<MeetingType> findByPublicSlugAndActiveTrue(String publicSlug);
    boolean existsByPublicSlug(String publicSlug);
}
