package com.meetflow.repository;

import com.meetflow.domain.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {
    List<ChatMessage> findAllByChannelIdOrderByCreatedAtDesc(UUID channelId, Pageable pageable);
}
