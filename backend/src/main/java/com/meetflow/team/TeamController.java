package com.meetflow.team;

import com.meetflow.domain.AppUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/team")
@RequiredArgsConstructor
public class TeamController {
    private final TeamService teamService;

    @GetMapping
    List<TeamDtos.MemberView> members(@AuthenticationPrincipal AppUser user) {
        return teamService.members(user);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    TeamDtos.MemberView create(@AuthenticationPrincipal AppUser user,
                               @Valid @RequestBody TeamDtos.CreateMemberRequest request) {
        return teamService.create(user, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    void deactivate(@AuthenticationPrincipal AppUser user, @PathVariable UUID id) {
        teamService.deactivate(user, id);
    }
}
