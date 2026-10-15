package com.wanshen.platform;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WorkerHealth {
    private record State(Instant attemptedAt, Instant succeededAt, String error) {}
    private final Map<String, State> states = new ConcurrentHashMap<>();

    public void success(String name) { states.put(name, new State(Instant.now(), Instant.now(), "")); }
    public void failure(String name, Throwable exception) {
        states.compute(name, (key, old) -> new State(Instant.now(), old == null ? null : old.succeededAt(),
                exception.getClass().getSimpleName()));
    }
    public Map<String, Object> status(String name, long maxIdleSeconds) {
        State state = states.get(name);
        boolean ready = state != null && state.error().isEmpty()
                && state.attemptedAt().isAfter(Instant.now().minusSeconds(maxIdleSeconds));
        var result = new LinkedHashMap<String, Object>();
        result.put("ready", ready);
        result.put("lastAttempt", state == null ? "" : state.attemptedAt().toString());
        result.put("lastSuccess", state == null || state.succeededAt() == null ? "" : state.succeededAt().toString());
        result.put("error", state == null ? "NOT_STARTED" : state.error());
        return result;
    }
}
