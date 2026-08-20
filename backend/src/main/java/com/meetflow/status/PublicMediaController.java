package com.meetflow.status;

import com.meetflow.common.NotFoundException;
import com.meetflow.domain.MediaObject;
import com.meetflow.repository.MediaObjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.UUID;

@RestController
@RequestMapping("/api/public/media")
@RequiredArgsConstructor
public class PublicMediaController {
    private final MediaObjectRepository mediaObjectRepository;

    @GetMapping("/{id}")
    ResponseEntity<byte[]> content(@PathVariable UUID id) {
        MediaObject media = mediaObjectRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Mídia não encontrada"));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.getContentType()))
                .contentLength(media.getSizeBytes())
                .cacheControl(CacheControl.maxAge(Duration.ofHours(24)).cachePublic())
                .body(media.getContent());
    }
}
