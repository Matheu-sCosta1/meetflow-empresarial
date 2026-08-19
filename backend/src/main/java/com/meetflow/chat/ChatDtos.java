package com.meetflow.chat;

import com.meetflow.domain.ChannelType;
import com.meetflow.domain.MessageType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class ChatDtos {
    private ChatDtos() {}
    public record CreateChannelRequest(@NotBlank @Size(max = 100) String name, ChannelType type) {}
    public record ChannelView(UUID id, String name, ChannelType type, Instant createdAt) {}
    public record SendMessageRequest(@NotBlank @Size(max = 4000) String content, MessageType messageType, @Size(max = 500) String attachmentUrl) {}
    public record MessageView(UUID id, UUID channelId, UUID senderId, String senderName, String content,
                              MessageType messageType, String attachmentUrl, Instant createdAt) {}
}
