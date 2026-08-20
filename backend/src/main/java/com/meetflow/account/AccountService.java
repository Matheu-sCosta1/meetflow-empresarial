package com.meetflow.account;

import com.meetflow.auth.AuthDtos;
import com.meetflow.auth.AuthService;
import com.meetflow.common.BusinessException;
import com.meetflow.domain.AppUser;
import com.meetflow.domain.UserRole;
import com.meetflow.repository.UserRepository;
import com.meetflow.status.StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class AccountService {
    private final UserRepository userRepository;
    private final AuthService authService;
    private final StorageService storageService;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthDtos.UserView update(AppUser user, AccountDtos.UpdateProfileRequest request) {
        user.setName(request.name().trim());
        user.setJobTitle(request.jobTitle().trim());
        if (request.organizationName() != null && !request.organizationName().isBlank()) {
            if (user.getRole() != UserRole.ADMIN) throw new BusinessException("Somente administradores podem alterar o nome da empresa");
            user.getOrganization().setName(request.organizationName().trim());
        }
        return authService.view(userRepository.save(user));
    }

    @Transactional
    public AuthDtos.UserView avatar(AppUser user, MultipartFile file) {
        StorageService.StoredMedia media = storageService.storeAvatar(file);
        String previous = user.getAvatarUrl();
        user.setAvatarUrl(media.url());
        AuthDtos.UserView view = authService.view(userRepository.save(user));
        storageService.delete(previous);
        return view;
    }

    @Transactional
    public void delete(AppUser user) {
        storageService.delete(user.getAvatarUrl());
        user.setAvatarUrl(null);
        user.setActive(false);
        user.setName("Conta excluída");
        user.setJobTitle("Conta removida");
        user.setEmail("deleted-" + user.getId() + "@meetflow.local");
        userRepository.save(user);
    }

    @Transactional
    public void changePassword(AppUser user, AccountDtos.ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new BusinessException("A senha atual está incorreta");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new BusinessException("A nova senha deve ser diferente da senha atual");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
    }
}
