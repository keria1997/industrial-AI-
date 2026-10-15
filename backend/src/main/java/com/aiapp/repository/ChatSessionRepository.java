package com.aiapp.repository;

import com.aiapp.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ChatSessionRepository extends JpaRepository<ChatSession, UUID> {
}

