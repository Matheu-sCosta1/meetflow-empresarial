package com.meetflow.team;

import com.meetflow.common.BusinessException;
import com.meetflow.common.NotFoundException;
import com.meetflow.domain.AppUser;
import com.meetflow.domain.Availability;
import com.meetflow.domain.UserRole;
import com.meetflow.repository.AvailabilityRepository;
import com.meetflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class TeamService {
    private final UserRepository userRepository;
    private final AvailabilityRepository availabilityRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<TeamDtos.MemberView> members(AppUser actor) {
        return userRepository.findAllByOrganizationIdOrderByName(actor.getOrganization().getId()).stream()
                .map(this::view).toList();
    }

    @Transactional
    public TeamDtos.MemberView create(AppUser actor, TeamDtos.CreateMemberRequest request) {
        if (userRepository.existsByEmailIgnoreCase(request.email())) throw new BusinessException("Este e-mail já está cadastrado");
        AppUser member = new AppUser();
        member.setOrganization(actor.getOrganization());
        member.setName(request.name().trim());
        member.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        member.setPasswordHash(passwordEncoder.encode(request.password()));
        member.setJobTitle(request.jobTitle().trim());
        member.setRole("ADMIN".equalsIgnoreCase(request.role()) ? UserRole.ADMIN : UserRole.MEMBER);
        member = userRepository.save(member);
        for (int day = 1; day <= 5; day++) {
            Availability availability = new Availability();
            availability.setOwner(member);
            availability.setDayOfWeek(day);
            availability.setStartTime(LocalTime.of(9, 0));
            availability.setEndTime(LocalTime.of(18, 0));
            availability.setTimezone("America/Sao_Paulo");
            availabilityRepository.save(availability);
        }
        return view(member);
    }

    @Transactional
    public void deactivate(AppUser actor, java.util.UUID memberId) {
        if (actor.getId().equals(memberId)) throw new BusinessException("Use as configurações da conta para excluir seu próprio acesso");
        AppUser member = userRepository.findById(memberId).orElseThrow(() -> new NotFoundException("Colaborador não encontrado"));
        if (!member.getOrganization().getId().equals(actor.getOrganization().getId())) throw new NotFoundException("Colaborador não encontrado");
        member.setActive(false);
        member.setEmail("deleted-" + member.getId() + "@meetflow.local");
        userRepository.save(member);
    }

    private TeamDtos.MemberView view(AppUser member) {
        return new TeamDtos.MemberView(member.getId(), member.getName(), member.getEmail(), member.getRole().name(),
                member.getJobTitle(), member.getAvatarUrl(), member.isActive());
    }
}
