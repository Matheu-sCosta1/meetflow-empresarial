package com.meetflow.repository;

import com.meetflow.domain.ChatChannel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatChannelRepository extends JpaRepository<ChatChannel, UUID> {
    List<ChatChannel> findAllByOrganizationIdOrderByName(UUID organizationId);
    Optional<ChatChannel> findByIdAndOrganizationId(UUID id, UUID organizationId);
}
