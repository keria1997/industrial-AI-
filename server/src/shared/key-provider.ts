import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface KeyProvider {
  currentKey(): Promise<{ keyId: string; key: Buffer }>;
  keyById(keyId: string): Promise<Buffer>;
}

export class EnvironmentKeyProvider implements KeyProvider {
  private readonly key: Buffer;

  constructor(private readonly keyId: string, encodedKey: string) {
    this.key = Buffer.from(encodedKey, "base64");
    if (this.key.length !== 32) throw new Error("FULFILLMENT_DATA_KEY must be a base64 encoded 32-byte key");
  }

  async currentKey() { return { keyId: this.keyId, key: this.key }; }
  async keyById(keyId: string) {
    if (keyId !== this.keyId) throw new Error("Encryption key is unavailable");
    return this.key;
  }
}

export type EncryptedValue = { ciphertext: string; keyId: string };

const aad = (tenantId: string, aggregateType: string, aggregateId: string, field: string) =>
  Buffer.from(`${tenantId}:${aggregateType}:${aggregateId}:${field}`, "utf8");

export async function encryptField(
  provider: KeyProvider,
  context: { tenantId: string; aggregateType: string; aggregateId: string; field: string },
  plaintext: string,
): Promise<EncryptedValue> {
  const { keyId, key } = await provider.currentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context.tenantId, context.aggregateType, context.aggregateId, context.field));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, authTag, encrypted]).toString("base64"), keyId };
}

export async function decryptField(
  provider: KeyProvider,
  context: { tenantId: string; aggregateType: string; aggregateId: string; field: string },
  value: EncryptedValue,
): Promise<string> {
  const payload = Buffer.from(value.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", await provider.keyById(value.keyId), payload.subarray(0, 12));
  decipher.setAAD(aad(context.tenantId, context.aggregateType, context.aggregateId, context.field));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

export const maskPhone = (phone: string) => {
  const normalized = phone.trim();
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
};
