package com.meetflow;

import com.meetflow.config.StorageProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
@EnableConfigurationProperties(StorageProperties.class)
public class MeetFlowApplication {
    public static void main(String[] args) {
        SpringApplication.run(MeetFlowApplication.class, args);
    }
}
