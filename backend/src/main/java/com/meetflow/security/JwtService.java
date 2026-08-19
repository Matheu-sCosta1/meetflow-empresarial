package com.meetflow.security;

import com.meetflow.domain.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {
    private final String secret;
    private final long expirationMinutes;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiration-minutes}") long expirationMinutes) {
        this.secret = secret;
        this.expirationMinutes = expirationMinutes;
    }

    public String generateToken(AppUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .claims(Map.of("role", user.getRole().name(), "organizationId", user.getOrganization().getId().toString()))
                .subject(user.getUsername())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expirationMinutes, ChronoUnit.MINUTES)))
                .signWith(signingKey())
                .compact();
    }

    public String extractUsername(String token) { return extractClaim(token, Claims::getSubject); }

    public boolean isValid(String token, AppUser user) {
        return user.getUsername().equalsIgnoreCase(extractUsername(token)) && extractClaim(token, Claims::getExpiration).after(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        Claims claims = Jwts.parser().verifyWith(signingKey()).build().parseSignedClaims(token).getPayload();
        return resolver.apply(claims);
    }

    private SecretKey signingKey() {
        byte[] bytes;
        try { bytes = Decoders.BASE64.decode(secret); }
        catch (IllegalArgumentException ignored) { bytes = secret.getBytes(StandardCharsets.UTF_8); }
        if (bytes.length < 32) bytes = Base64.getEncoder().encode(secret.repeat(2).getBytes(StandardCharsets.UTF_8));
        return Keys.hmacShaKeyFor(bytes);
    }
}
