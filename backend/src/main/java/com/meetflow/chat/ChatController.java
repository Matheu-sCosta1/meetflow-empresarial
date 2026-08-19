package com.meetflow.chat;

import com.meetflow.domain.AppUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {
    private final ChatService chatService;

    @GetMapping("/channels")
    List<ChatDtos.ChannelView> channels(@AuthenticationPrincipal AppUser user) { return chatService.channels(user); }

    @PostMapping("/channels") @ResponseStatus(HttpStatus.CREATED)
    ChatDtos.ChannelView create(@AuthenticationPrincipal AppUser user, @Valid @RequestBody ChatDtos.CreateChannelRequest request) { return chatService.createChannel(user, request); }

    @GetMapping("/channels/{channelId}/messages")
    List<ChatDtos.MessageView> messages(@AuthenticationPrincipal AppUser user, @PathVariable UUID channelId, @RequestParam(defaultValue = "50") int limit) { return chatService.messages(user, channelId, limit); }

    @PostMapping("/channels/{channelId}/messages") @ResponseStatus(HttpStatus.CREATED)
    ChatDtos.MessageView send(@AuthenticationPrincipal AppUser user, @PathVariable UUID channelId, @Valid @RequestBody ChatDtos.SendMessageRequest request) { return chatService.send(user, channelId, request); }
}
