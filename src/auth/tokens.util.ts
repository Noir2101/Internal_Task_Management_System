import { createId } from '@paralleldrive/cuid2';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Tiện ích cho refresh token (docs/05 §8). Refresh là chuỗi opaque random (KHÔNG JWT);
 * store lưu SHA-256 tất định → tra `tokenHash` unique một phát (§8.1). Cookie mang raw.
 */

/** SHA-256 (hex) — tất định, để lookup `WHERE tokenHash = sha256(presented)`. */
export function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Token thô high-entropy (≥256 bit) — brute-force bất khả thi bất kể tốc độ hash (§8.1). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** familyId mới cho mỗi login = một lineage rotation (§8.3, §8.5). */
export function newFamilyId(): string {
  return createId();
}
