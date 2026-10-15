package com.wanshen.platform.personnel;

import com.wanshen.platform.personnel.AbstractPersonnelStore.OutboxEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PersonnelOutboxWorkerTests {
    @Test
    void discoversTenantsAndMarksPendingEventsPublished() {
        PersonnelStore store = new PersonnelStore();
        store.addOutbox(new OutboxEvent(
                "evt-1", "TENANT-A", "hr.employee.created.v1", "Employee", "emp-1", 1,
                "corr-1", "trace-1", Map.of("employeeId", "emp-1"), "PENDING", 0, "",
                Instant.now().toString()
        ));

        PersonnelOutboxWorker worker = new PersonnelOutboxWorker(store, "", true, 5);
        PersonnelOutboxWorker.DrainResult result = worker.drain("TENANT-A");

        assertEquals(1, result.published());
        assertEquals(0, result.failed());
        assertEquals(List.of(), store.pendingOutbox("TENANT-A"));
    }

    @Test
    void movesRepeatedFailuresToDeadLetter() {
        PersonnelStore store = new PersonnelStore();
        OutboxEvent event = new OutboxEvent(
                "evt-1", "TENANT-A", "hr.employee.created.v1", "Employee", "emp-1", 1,
                "corr-1", "trace-1", Map.of(), "PENDING", 4, "", Instant.now().toString()
        );
        store.addOutbox(event);
        PersonnelOutboxWorker worker = new PersonnelOutboxWorker(store, "", true, 5);
        store.markOutboxFailed("TENANT-A", "evt-1", "publisher unavailable", 5);

        assertEquals(List.of(), store.pendingOutbox("TENANT-A"));
        assertEquals(0, worker.drain("TENANT-A").published());
    }
}
