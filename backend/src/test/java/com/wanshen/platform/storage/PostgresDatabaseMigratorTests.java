package com.wanshen.platform.storage;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresDatabaseMigratorTests {
    @Test
    void usesStableSha256Checksums() {
        String first = PostgresDatabaseMigrator.migrationChecksum("CREATE TABLE a (id integer);");
        String second = PostgresDatabaseMigrator.migrationChecksum("CREATE TABLE a (id integer);");
        String changed = PostgresDatabaseMigrator.migrationChecksum("CREATE TABLE a (id bigint);");

        assertEquals(first, second);
        assertNotEquals(first, changed);
        assertEquals(64, first.length());
        assertTrue(first.chars().allMatch(character -> Character.isDigit(character)
                || (character >= 'a' && character <= 'f')));
    }

    @Test
    void loadsTheCompleteClasspathMigrationChain() throws Exception {
        List<PostgresDatabaseMigrator.MigrationFile> files = DatabaseMigrationRunner.migrationFiles();

        assertEquals(35, files.size());
        assertEquals("001_production_p0.sql", files.get(0).filename());
        assertEquals("035_unify_sales_customer_master.sql", files.get(files.size() - 1).filename());
        assertEquals(35, files.stream().map(PostgresDatabaseMigrator.MigrationFile::filename).distinct().count());
        assertEquals(17, PostgresDatabaseMigrator.legacyFileSentinelEntries().size());
    }
}
