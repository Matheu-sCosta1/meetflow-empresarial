package com.meetflow.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AccountDtos {
    private AccountDtos() {}

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 120) String jobTitle,
            @Size(max = 120) String organizationName) {}

    public record DeleteAccountRequest(
            @NotBlank @Pattern(regexp = "EXCLUIR", message = "digite EXCLUIR para confirmar") String confirmation) {}

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 100) String newPassword) {}
}
