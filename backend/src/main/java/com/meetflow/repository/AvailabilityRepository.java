package com.meetflow.repository;

import com.meetflow.domain.Availability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AvailabilityRepository extends JpaRepository<Availability, UUID> {
    List<Availability> findAllByOwnerIdAndActiveTrueOrderByDayOfWeekAscStartTimeAsc(UUID ownerId);
}
