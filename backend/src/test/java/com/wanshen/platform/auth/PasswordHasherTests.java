package com.wanshen.platform.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordHasherTests {
    @Test
    void verifiesNodeScryptHashFormat() throws Exception {
        PasswordHasher hasher = new PasswordHasher();
        var scrypt = PasswordHasher.class.getDeclaredMethod("scrypt", String.class, byte[].class, int.class, int.class, int.class);
        scrypt.setAccessible(true);
        var pbkdf2 = PasswordHasher.class.getDeclaredMethod("pbkdf2", byte[].class, byte[].class, int.class, int.class);
        pbkdf2.setAccessible(true);
        byte[] initial = (byte[]) pbkdf2.invoke(hasher, "".getBytes(), "NaCl".getBytes(), 1, 64);
        assertArrayEquals(java.util.HexFormat.of().parseHex(
                "2ddb49243eb3b5912cb260cdd87fb04ef0d111bfa44d40a45e02a8a5c3c1518d6" +
                "69e824abc41cb58c242b46e37606d693d7cb5c4c33ece406719bfeb4a1de11b"), initial);
        byte[] vector = (byte[]) scrypt.invoke(hasher, "", "NaCl".getBytes(), 64, 2, 1);
        assertArrayEquals(java.util.HexFormat.of().parseHex(
                "6c5347b49e42e22ca6fd9090348482fa25741b53ec12bed5851dadc4ae6980256" +
                "7a2192deef27d8c6df8aca171634ac8fcdb5d8887b0c8d161ff8380278a4a6c"), vector);
        String stored = "0123456789abcdef0123456789abcdef:d088ff89d52c0da7840b769c9055596af699cfdd025910d984548f1c2aaec912263f7f9b924ed19c9e43feff83d9fa02bea94b1b90b66671f3083fd85d65de4f";
        byte[] actual = (byte[]) scrypt.invoke(hasher, "password123",
                java.util.HexFormat.of().parseHex("0123456789abcdef0123456789abcdef"), 64, 16384, 8);
        assertArrayEquals(java.util.HexFormat.of().parseHex(stored.split(":")[1]), actual);
        assertTrue(hasher.verify("password123", stored));
    }
}
