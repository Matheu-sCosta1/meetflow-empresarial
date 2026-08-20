package com.meetflow.auth;

import com.meetflow.domain.*;
import com.meetflow.repository.ChatChannelRepository;
import com.meetflow.repository.AvailabilityRepository;
import com.meetflow.repository.OrganizationRepository;
import com.meetflow.repository.UserRepository;
import com.meetflow.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.Locale;
import java.util.UUID;
import java.time.LocalTime;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final ChatChannelRepository channelRepository;
    private final AvailabilityRepository availabilityRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public AuthDtos.AuthResponse register(AuthDtos.RegisterRequest request) {
        if (userRepository.existsByEmailIgnoreCase(request.email())) throw new DataIntegrityViolationException("Este e-mail já está cadastrado");
        String slug = uniqueSlug(request.organizationName());
        Organization organization = organizationRepository.save(new Organization(request.organizationName().trim(), slug));

        AppUser user = new AppUser();
        user.setOrganization(organization);
        user.setName(request.name().trim());
        user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(UserRole.ADMIN);
        user.setJobTitle("Administrador");
        user = userRepository.save(user);

        for (int day = 1; day <= 5; day++) {
            Availability availability = new Availability();
            availability.setOwner(user);
            availability.setDayOfWeek(day);
            availability.setStartTime(LocalTime.of(9, 0));
            availability.setEndTime(LocalTime.of(18, 0));
            availability.setTimezone("America/Sao_Paulo");
            availabilityRepository.save(availability);
        }

        ChatChannel general = new ChatChannel();
        general.setOrganization(organization);
        general.setCreatedBy(user);
        general.setName("Geral");
        general.setType(ChannelType.GROUP);
        channelRepository.save(general);
        return response(user);
    }

    public AuthDtos.AuthResponse login(AuthDtos.LoginRequest request) {
        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        AppUser user = userRepository.findByEmailIgnoreCase(request.email()).orElseThrow();
        return response(user);
    }

    public AuthDtos.UserView view(AppUser user) {
        Organization org = user.getOrganization();
        return new AuthDtos.UserView(user.getId(), user.getName(), user.getEmail(), user.getRole().name(),
                user.getJobTitle(), user.getAvatarUrl(), org.getId(), org.getName(), org.getSlug());
    }

    private AuthDtos.AuthResponse response(AppUser user) { return new AuthDtos.AuthResponse(jwtService.generateToken(user), view(user)); }

    private String uniqueSlug(String value) {
        String base = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.isBlank()) base = "empresa";
        String candidate = base;
        while (organizationRepository.existsBySlug(candidate)) candidate = base + "-" + UUID.randomUUID().toString().substring(0, 6);
        return candidate;
    }
}
