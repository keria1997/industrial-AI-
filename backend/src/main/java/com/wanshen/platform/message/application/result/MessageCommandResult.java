package com.wanshen.platform.message.application.result;

import java.util.Optional;

/** Typed application result carried back to the API layer for HTTP status and ETag handling. */
public interface MessageCommandResult<T> {
    T body();

    int status();

    default Optional<Integer> version() {
        return Optional.empty();
    }

    default boolean replayed() {
        return false;
    }
}
