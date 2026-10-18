package com.wanshen.platform.message;

import com.wanshen.platform.message.domain.MessageOutboxEvent;
import com.wanshen.platform.message.domain.MessageOutboxPayload;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MessageOutboxWorkerTests {
    @Test
    void drainsPendingEvents() {
        MessageStore store = new MessageStore();
        store.addOutbox(new MessageOutboxEvent(UUID.randomUUID().toString(), "T1", "test.v1", "Test",
                "1", 1, UUID.randomUUID().toString(), "trace", MessageOutboxPayload.empty(), "PENDING",
                0, "", Instant.now().toString()));
        assertEquals(new MessageOutboxWorker.DrainResult(1, 0),
                new MessageOutboxWorker(store, "", false, 5).drain("T1"));
    }

    @Test
    void discoversPendingTenants() {
        MessageStore store = new MessageStore();
        String tenant = "T2";
        store.addOutbox(new MessageOutboxEvent(UUID.randomUUID().toString(), tenant, "test.v1", "Test",
                "1", 1, UUID.randomUUID().toString(), "trace", MessageOutboxPayload.empty(), "PENDING",
                0, "", Instant.now().toString()));
        assertEquals(List.of(tenant), store.pendingOutboxTenantIds());
    }
}
