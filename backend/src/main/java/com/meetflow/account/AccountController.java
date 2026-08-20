package com.meetflow.account;

import com.meetflow.auth.AuthDtos;
import com.meetflow.domain.AppUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {
    private final AccountService accountService;

    @PatchMapping("/profile")
    AuthDtos.UserView update(@AuthenticationPrincipal AppUser user,
                             @Valid @RequestBody AccountDtos.UpdateProfileRequest request) {
        return accountService.update(user, request);
    }

    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    AuthDtos.UserView avatar(@AuthenticationPrincipal AppUser user,
                             @RequestPart MultipartFile file) {
        return accountService.avatar(user, file);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal AppUser user,
                @Valid @RequestBody AccountDtos.DeleteAccountRequest request) {
        accountService.delete(user);
    }

    @PatchMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void password(@AuthenticationPrincipal AppUser user,
                  @Valid @RequestBody AccountDtos.ChangePasswordRequest request) {
        accountService.changePassword(user, request);
    }
}
