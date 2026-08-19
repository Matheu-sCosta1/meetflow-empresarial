package com.meetflow.meeting;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

@Slf4j
@Service
public class NotificationService {
    private final String mode;
    private final String from;
    private final SesClient sesClient;

    public NotificationService(@Value("${app.mail.mode}") String mode,
                               @Value("${app.mail.region}") String region,
                               @Value("${app.mail.from}") String from) {
        this.mode = mode;
        this.from = from;
        this.sesClient = "ses".equalsIgnoreCase(mode) ? SesClient.builder().region(Region.of(region)).build() : null;
    }

    public void sendMeetingConfirmation(String recipient, String guestName, String title, String when) {
        String subject = "Reunião confirmada: " + title;
        String body = "Olá, " + guestName + "!\n\nSua reunião \"" + title + "\" foi confirmada para " + when + ".\n\nEquipe MeetFlow";
        if (!"ses".equalsIgnoreCase(mode)) {
            log.info("[MAIL-DEV] para={} assunto={} corpo={}", recipient, subject, body.replace('\n', ' '));
            return;
        }
        Destination destination = Destination.builder().toAddresses(recipient).build();
        Content subjectContent = Content.builder().charset("UTF-8").data(subject).build();
        Content text = Content.builder().charset("UTF-8").data(body).build();
        Message message = Message.builder().subject(subjectContent).body(Body.builder().text(text).build()).build();
        try {
            sesClient.sendEmail(SendEmailRequest.builder().source(from).destination(destination).message(message).build());
        } catch (SesException exception) {
            log.error("Não foi possível enviar a confirmação para {}: {}", recipient, exception.awsErrorDetails().errorMessage());
        }
    }

    @PreDestroy
    void close() { if (sesClient != null) sesClient.close(); }
}
