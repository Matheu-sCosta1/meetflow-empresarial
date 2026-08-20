package com.meetflow.team;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class TeamDtos {
    private TeamDtos() {}

    public record CreateMemberRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(max = 120) String jobTitle,
            String role) {}

    public record MemberView(UUID id, String name, String email, String role, String jobTitle,
                             String avatarUrl, boolean active) {}
}
