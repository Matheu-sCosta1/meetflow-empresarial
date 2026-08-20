package com.meetflow.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(String path, String mode, long databaseMaxBytes) {
    public boolean databaseEnabled() { return "database".equalsIgnoreCase(mode); }
}
