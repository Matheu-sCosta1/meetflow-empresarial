package com.meetflow.auth;

import com.meetflow.domain.AppUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    AuthDtos.AuthResponse register(@Valid @RequestBody AuthDtos.RegisterRequest request) { return authService.register(request); }

    @PostMapping("/login")
    AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest request) { return authService.login(request); }

    @GetMapping("/me")
    AuthDtos.UserView me(@AuthenticationPrincipal AppUser user) { return authService.view(user); }
}
