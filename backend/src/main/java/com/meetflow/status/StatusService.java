package com.meetflow.status;

import com.meetflow.common.BusinessException;
import com.meetflow.common.NotFoundException;
import com.meetflow.domain.AppUser;
import com.meetflow.domain.MediaType;
import com.meetflow.domain.TeamStatus;
import com.meetflow.repository.TeamStatusRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class StatusService {
    private final TeamStatusRepository statusRepository;
    private final StorageService storageService;

    @Transactional(readOnly = true)
    public List<StatusDtos.StatusView> active(AppUser user) {
        return statusRepository.findAllByOrganizationIdAndExpiresAtAfterOrderByCreatedAtDesc(user.getOrganization().getId(), Instant.now()).stream().map(this::view).toList();
    }

    @Transactional
    public StatusDtos.StatusView publish(AppUser user, String caption, MultipartFile file) {
        if ((caption == null || caption.isBlank()) && (file == null || file.isEmpty())) throw new BusinessException("Adicione um texto, uma foto ou um vídeo");
        TeamStatus status = new TeamStatus();
        status.setOrganization(user.getOrganization());
        status.setAuthor(user);
        status.setCaption(caption == null ? null : caption.trim());
        status.setExpiresAt(Instant.now().plus(24, ChronoUnit.HOURS));
        if (file != null && !file.isEmpty()) {
            StorageService.StoredMedia media = storageService.store(file);
            status.setMediaUrl(media.url());
            status.setMediaType(MediaType.valueOf(media.type()));
        } else status.setMediaType(MediaType.TEXT);
        return view(statusRepository.save(status));
    }

    @Transactional
    public void delete(AppUser user, UUID id) {
        TeamStatus status = statusRepository.findById(id).orElseThrow(() -> new NotFoundException("Status não encontrado"));
        if (!status.getOrganization().getId().equals(user.getOrganization().getId()) || !status.getAuthor().getId().equals(user.getId()))
            throw new NotFoundException("Status não encontrado");
        storageService.delete(status.getMediaUrl());
        statusRepository.delete(status);
    }

    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void removeExpired() {
        List<TeamStatus> expired = statusRepository.findAllByExpiresAtBefore(Instant.now());
        expired.forEach(status -> storageService.delete(status.getMediaUrl()));
        statusRepository.deleteAll(expired);
    }

    private StatusDtos.StatusView view(TeamStatus status) {
        return new StatusDtos.StatusView(status.getId(), status.getAuthor().getId(), status.getAuthor().getName(), status.getMediaType(), status.getMediaUrl(), status.getCaption(), status.getCreatedAt(), status.getExpiresAt());
    }
}
