package com.meetflow.status;

import com.meetflow.common.BusinessException;
import com.meetflow.config.StorageProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class StorageService {
    private static final Set<String> ALLOWED = Set.of("image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm");
    private final StorageProperties properties;
    private Path root;

    @PostConstruct
    void init() throws IOException {
        root = Path.of(properties.path()).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    public StoredMedia store(MultipartFile file) {
        if (file.isEmpty()) throw new BusinessException("O arquivo está vazio");
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!ALLOWED.contains(contentType)) throw new BusinessException("Formato de mídia não permitido");
        String extension = extension(contentType);
        String filename = UUID.randomUUID() + extension;
        Path destination = root.resolve(filename).normalize();
        if (!destination.startsWith(root)) throw new BusinessException("Nome de arquivo inválido");
        try { Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING); }
        catch (IOException exception) { throw new BusinessException("Não foi possível salvar a mídia"); }
        return new StoredMedia("/media/" + filename, contentType.startsWith("video/") ? "VIDEO" : "IMAGE");
    }

    public StoredMedia storeAvatar(MultipartFile file) {
        if (file.getSize() > 5 * 1024 * 1024) throw new BusinessException("A foto de perfil deve ter no máximo 5 MB");
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!contentType.startsWith("image/")) throw new BusinessException("A foto de perfil deve ser uma imagem");
        return store(file);
    }

    public void delete(String mediaUrl) {
        if (mediaUrl == null || !mediaUrl.startsWith("/media/")) return;
        Path target = root.resolve(mediaUrl.substring("/media/".length())).normalize();
        if (!target.startsWith(root)) return;
        try { Files.deleteIfExists(target); } catch (IOException ignored) { }
    }

    private String extension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "video/quicktime" -> ".mov";
            case "video/webm" -> ".webm";
            default -> ".mp4";
        };
    }

    public record StoredMedia(String url, String type) {}
}
