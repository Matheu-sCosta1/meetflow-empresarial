package com.meetflow.repository;

import com.meetflow.domain.MediaObject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface MediaObjectRepository extends JpaRepository<MediaObject, UUID> {}
