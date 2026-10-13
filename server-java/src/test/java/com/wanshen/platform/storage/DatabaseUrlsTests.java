package com.wanshen.platform.storage;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DatabaseUrlsTests {
    @Test
    void normalizesLegacyPostgresUrlsToJdbcUrls() {
        assertEquals("jdbc:postgresql://host:5432/db",
                DatabaseUrls.jdbc("postgresql://user:secret@host:5432/db?sslmode=require").split("\\?")[0]);
        assertEquals("user=user&password=secret",
                DatabaseUrls.jdbc("postgres://user:secret@host:5432/db?sslmode=require").split("sslmode=require&")[1]);
        assertEquals("jdbc:postgresql://host:5432/db",
                DatabaseUrls.jdbc("jdbc:postgresql://host:5432/db"));
    }

    @Test
    void movesUriUserInfoIntoJdbcParameters() {
        assertEquals("jdbc:postgresql://127.0.0.1:55432/industrial_ai?user=liyi",
                DatabaseUrls.jdbc("postgresql://liyi@127.0.0.1:55432/industrial_ai"));
        assertEquals("jdbc:postgresql://127.0.0.1:55432/industrial_ai?sslmode=require&user=liyi&password=p%40ss",
                DatabaseUrls.jdbc("postgres://liyi:p%40ss@127.0.0.1:55432/industrial_ai?sslmode=require"));
    }

    @Test
    void rejectsUnsupportedDatabaseUrls() {
        assertThrows(IllegalArgumentException.class, () -> DatabaseUrls.jdbc("mysql://host/db"));
        assertThrows(IllegalArgumentException.class, () -> DatabaseUrls.jdbc("host/db"));
    }
}
