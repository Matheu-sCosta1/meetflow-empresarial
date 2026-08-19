package com.meetflow.status;

import com.meetflow.domain.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/statuses")
@RequiredArgsConstructor
public class StatusController {
    private final StatusService statusService;

    @GetMapping
    List<StatusDtos.StatusView> active(@AuthenticationPrincipal AppUser user) { return statusService.active(user); }

    @PostMapping(consumes = "multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    StatusDtos.StatusView publish(@AuthenticationPrincipal AppUser user,
                                  @RequestPart(required = false) String caption,
                                  @RequestPart(required = false) MultipartFile file) { return statusService.publish(user, caption, file); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal AppUser user, @PathVariable UUID id) { statusService.delete(user, id); }
}
