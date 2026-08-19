package com.meetflow.chat;

import com.meetflow.common.NotFoundException;
import com.meetflow.domain.*;
import com.meetflow.repository.ChatChannelRepository;
import com.meetflow.repository.ChatMessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatService {
    private final ChatChannelRepository channelRepository;
    private final ChatMessageRepository messageRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional(readOnly = true)
    public List<ChatDtos.ChannelView> channels(AppUser user) {
        return channelRepository.findAllByOrganizationIdOrderByName(user.getOrganization().getId()).stream().map(this::channelView).toList();
    }

    @Transactional
    public ChatDtos.ChannelView createChannel(AppUser user, ChatDtos.CreateChannelRequest request) {
        ChatChannel channel = new ChatChannel();
        channel.setOrganization(user.getOrganization());
        channel.setCreatedBy(user);
        channel.setName(request.name().trim());
        channel.setType(request.type() == null ? ChannelType.GROUP : request.type());
        return channelView(channelRepository.save(channel));
    }

    @Transactional(readOnly = true)
    public List<ChatDtos.MessageView> messages(AppUser user, UUID channelId, int limit) {
        requireChannel(user, channelId);
        List<ChatDtos.MessageView> messages = messageRepository.findAllByChannelIdOrderByCreatedAtDesc(channelId, PageRequest.of(0, Math.min(Math.max(limit, 1), 100)))
                .stream().map(this::messageView).toList();
        java.util.ArrayList<ChatDtos.MessageView> chronological = new java.util.ArrayList<>(messages);
        Collections.reverse(chronological);
        return chronological;
    }

    @Transactional
    public ChatDtos.MessageView send(AppUser user, UUID channelId, ChatDtos.SendMessageRequest request) {
        ChatChannel channel = requireChannel(user, channelId);
        ChatMessage message = new ChatMessage();
        message.setChannel(channel);
        message.setSender(user);
        message.setContent(request.content().trim());
        message.setMessageType(request.messageType() == null ? MessageType.TEXT : request.messageType());
        message.setAttachmentUrl(request.attachmentUrl());
        ChatDtos.MessageView view = messageView(messageRepository.save(message));
        messagingTemplate.convertAndSend("/topic/channels/" + channelId, view);
        return view;
    }

    private ChatChannel requireChannel(AppUser user, UUID channelId) {
        return channelRepository.findByIdAndOrganizationId(channelId, user.getOrganization().getId())
                .orElseThrow(() -> new NotFoundException("Canal não encontrado"));
    }

    private ChatDtos.ChannelView channelView(ChatChannel channel) { return new ChatDtos.ChannelView(channel.getId(), channel.getName(), channel.getType(), channel.getCreatedAt()); }
    private ChatDtos.MessageView messageView(ChatMessage message) { return new ChatDtos.MessageView(message.getId(), message.getChannel().getId(), message.getSender().getId(), message.getSender().getName(), message.getContent(), message.getMessageType(), message.getAttachmentUrl(), message.getCreatedAt()); }
}
