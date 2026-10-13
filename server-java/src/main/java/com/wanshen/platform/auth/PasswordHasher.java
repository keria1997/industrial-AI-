package com.wanshen.platform.auth;

import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

@Service
public class PasswordHasher {
    private static final int COST = 16384;
    private static final int BLOCK_SIZE = 8;
    private static final int PARALLELIZATION = 1;
    private static final int KEY_LENGTH = 64;

    private final SecureRandom random = new SecureRandom();

    public String hash(String password) {
        byte[] salt = new byte[16];
        random.nextBytes(salt);
        return hex(salt) + ":" + hex(scrypt(password, salt, KEY_LENGTH));
    }

    public boolean verify(String password, String stored) {
        String[] parts = stored.split(":");
        if (parts.length != 2) return false;
        byte[] salt = parseHex(parts[0]);
        byte[] expected = parseHex(parts[1]);
        byte[] actual = scrypt(password, salt, expected.length);
        return actual.length == expected.length && MessageDigest.isEqual(actual, expected);
    }

    private byte[] scrypt(String password, byte[] salt, int keyLength) {
        return scrypt(password, salt, keyLength, COST, BLOCK_SIZE);
    }

    private byte[] scrypt(String password, byte[] salt, int keyLength, int cost, int blockSize) {
        int blockWords = 2 * BLOCK_SIZE;
        int bytes = 128 * blockSize;
        byte[] derived = pbkdf2(password.getBytes(StandardCharsets.UTF_8), salt, 1, PARALLELIZATION * bytes);
        byte[] output = new byte[PARALLELIZATION * bytes];
        for (int index = 0; index < PARALLELIZATION; index++) {
            byte[] block = Arrays.copyOfRange(derived, index * bytes, (index + 1) * bytes);
            romix(block, cost, blockSize);
            System.arraycopy(block, 0, output, index * bytes, bytes);
        }
        return pbkdf2(password.getBytes(StandardCharsets.UTF_8), output, 1, keyLength);
    }

    private void romix(byte[] block, int cost, int blockSize) {
        byte[][] vector = new byte[cost][];
        int blocks = 2 * blockSize;
        byte[] current = Arrays.copyOf(block, block.length);
        for (int index = 0; index < cost; index++) {
            vector[index] = Arrays.copyOf(current, current.length);
            blockMix(current, blocks);
        }
        for (int index = 0; index < cost; index++) {
            int selected = integer(current, blocks) & (cost - 1);
            xor(current, vector[selected]);
            blockMix(current, blocks);
        }
        System.arraycopy(current, 0, block, 0, block.length);
    }

    private void blockMix(byte[] value, int blocks) {
        byte[] x = Arrays.copyOfRange(value, (blocks - 1) * 64, blocks * 64);
        byte[][] y = new byte[blocks][64];
        for (int index = 0; index < blocks; index++) {
            byte[] input = Arrays.copyOfRange(value, index * 64, (index + 1) * 64);
            for (int offset = 0; offset < 64; offset++) input[offset] ^= x[offset];
            x = salsa(input);
            y[index] = Arrays.copyOf(x, 64);
        }
        for (int index = 0; index < blocks / 2; index++) {
            System.arraycopy(y[2 * index], 0, value, index * 64, 64);
            System.arraycopy(y[2 * index + 1], 0, value, (index + blocks / 2) * 64, 64);
        }
    }

    private byte[] salsa(byte[] input) {
        int[] words = new int[16];
        ByteBuffer source = ByteBuffer.wrap(input).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        for (int index = 0; index < 16; index++) words[index] = source.getInt();
        int[] value = Arrays.copyOf(words, 16);
        for (int round = 0; round < 4; round++) {
            value[4] ^= rotate(value[0] + value[12], 7);
            value[8] ^= rotate(value[4] + value[0], 9);
            value[12] ^= rotate(value[8] + value[4], 13);
            value[0] ^= rotate(value[12] + value[8], 18);
            value[9] ^= rotate(value[5] + value[1], 7);
            value[13] ^= rotate(value[9] + value[5], 9);
            value[1] ^= rotate(value[13] + value[9], 13);
            value[5] ^= rotate(value[1] + value[13], 18);
            value[14] ^= rotate(value[10] + value[6], 7);
            value[2] ^= rotate(value[14] + value[10], 9);
            value[6] ^= rotate(value[2] + value[14], 13);
            value[10] ^= rotate(value[6] + value[2], 18);
            value[3] ^= rotate(value[15] + value[11], 7);
            value[7] ^= rotate(value[3] + value[15], 9);
            value[11] ^= rotate(value[7] + value[3], 13);
            value[15] ^= rotate(value[11] + value[7], 18);
            value[1] ^= rotate(value[0] + value[3], 7);
            value[2] ^= rotate(value[1] + value[0], 9);
            value[3] ^= rotate(value[2] + value[1], 13);
            value[0] ^= rotate(value[3] + value[2], 18);
            value[6] ^= rotate(value[5] + value[4], 7);
            value[7] ^= rotate(value[6] + value[5], 9);
            value[4] ^= rotate(value[7] + value[6], 13);
            value[5] ^= rotate(value[4] + value[7], 18);
            value[11] ^= rotate(value[10] + value[9], 7);
            value[8] ^= rotate(value[11] + value[10], 9);
            value[9] ^= rotate(value[8] + value[11], 13);
            value[10] ^= rotate(value[9] + value[8], 18);
            value[12] ^= rotate(value[15] + value[14], 7);
            value[13] ^= rotate(value[12] + value[15], 9);
            value[14] ^= rotate(value[13] + value[12], 13);
            value[15] ^= rotate(value[14] + value[13], 18);
        }
        ByteBuffer output = ByteBuffer.allocate(64).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        for (int index = 0; index < 16; index++) output.putInt(value[index] + words[index]);
        return output.array();
    }

    private int rotate(int value, int bits) { return (value << bits) | (value >>> (32 - bits)); }
    private int integer(byte[] value, int blocks) {
        return ByteBuffer.wrap(value, (blocks - 1) * 64, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt();
    }
    private void xor(byte[] target, byte[] value) { for (int i = 0; i < target.length; i++) target[i] ^= value[i]; }
    private void encodeInt(byte[] target, int offset, int value) {
        target[offset] = (byte) (value >>> 24); target[offset + 1] = (byte) (value >>> 16);
        target[offset + 2] = (byte) (value >>> 8); target[offset + 3] = (byte) value;
    }
    private byte[] pbkdf2(byte[] password, byte[] salt, int iterations, int length) {
        try {
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            byte[] macKey = password.length > 64 ? MessageDigest.getInstance("SHA-256").digest(password) : Arrays.copyOf(password, 64);
            mac.init(new javax.crypto.spec.SecretKeySpec(macKey, "HmacSHA256"));
            byte[] output = new byte[length];
            int offset = 0;
            int block = 1;
            while (offset < length) {
                mac.reset();
                byte[] saltBlock = Arrays.copyOf(salt, salt.length + 4);
                encodeInt(saltBlock, salt.length, block);
                byte[] u = mac.doFinal(saltBlock);
                byte[] result = Arrays.copyOf(u, u.length);
                for (int iteration = 1; iteration < iterations; iteration++) {
                    mac.reset();
                    u = mac.doFinal(u);
                    for (int index = 0; index < result.length; index++) result[index] ^= u[index];
                }
                int copied = Math.min(result.length, length - offset);
                System.arraycopy(result, 0, output, offset, copied);
                offset += copied;
                block++;
            }
            return output;
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new IllegalStateException(exception);
        }
    }
    private String hex(byte[] value) {
        StringBuilder result = new StringBuilder();
        for (byte item : value) result.append(String.format("%02x", item));
        return result.toString();
    }
    private byte[] parseHex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
