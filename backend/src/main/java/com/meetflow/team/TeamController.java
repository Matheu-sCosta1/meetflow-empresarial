package com.meetflow.team;

import com.meetflow.domain.AppUser;
import com.meetflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/team")
@RequiredArgsConstructor
public class TeamController {
    private final UserRepository userRepository;

    @GetMapping
    List<MemberView> members(@AuthenticationPrincipal AppUser user) {
        return userRepository.findAllByOrganizationIdOrderByName(user.getOrganization().getId()).stream()
                .map(member -> new MemberView(member.getId(), member.getName(), member.getEmail(), member.getRole().name(), member.getAvatarUrl(), member.isActive())).toList();
    }

    public record MemberView(UUID id, String name, String email, String role, String avatarUrl, boolean active) {}
}
