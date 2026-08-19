package com.meetflow.security;

import com.meetflow.domain.AppUser;
import com.meetflow.repository.ChatChannelRepository;
import com.meetflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final ChatChannelRepository channelRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) throw new IllegalArgumentException("Token WebSocket ausente");
            String token = header.substring(7);
            AppUser user = userRepository.findByEmailIgnoreCase(jwtService.extractUsername(token))
                    .filter(candidate -> jwtService.isValid(token, candidate))
                    .orElseThrow(() -> new IllegalArgumentException("Token WebSocket inválido"));
            accessor.setUser(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        }
        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            if (!(accessor.getUser() instanceof UsernamePasswordAuthenticationToken authentication)
                    || !(authentication.getPrincipal() instanceof AppUser user)) throw new IllegalArgumentException("Sessão WebSocket não autenticada");
            String destination = accessor.getDestination();
            String prefix = "/topic/channels/";
            if (destination == null || !destination.startsWith(prefix)) throw new IllegalArgumentException("Tópico não permitido");
            UUID channelId;
            try { channelId = UUID.fromString(destination.substring(prefix.length())); }
            catch (IllegalArgumentException exception) { throw new IllegalArgumentException("Canal inválido"); }
            if (channelRepository.findByIdAndOrganizationId(channelId, user.getOrganization().getId()).isEmpty())
                throw new IllegalArgumentException("Canal não permitido");
        }
        return message;
    }
}
