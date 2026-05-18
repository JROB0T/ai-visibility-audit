// ============================================================
// API key generation + verification.
//
// Key format: avak_live_<32 hex chars>
//   avak = "AI Visibility Audit Key" — namespace prefix so a leaked
//   key is recognisable on sight (e.g. in a git diff or log dump)
//   live = environment indicator; could swap to "test" if we ever
//   add a sandbox tier
//   32 hex = 128 bits of entropy from crypto.randomBytes
//
// Storage:
//   - We never persist the raw key. After creation, the caller is
//     shown the key ONCE — they're responsible for copying it.
//   - The DB stores SHA-256(key) in key_hash and the first 8 chars
//     of the raw key in key_prefix for display purposes ("avak_live_a3f7…").
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

const KEY_PREFIX = 'avak_live_';
const KEY_ENTROPY_BYTES = 16; // → 32 hex chars

export interface CreateKeyResult {
  /** The full raw key. Shown once to the user; never persisted. */
  rawKey: string;
  /** The DB row id (use this for revocation). */
  id: string;
  prefix: string;
  name: string;
  createdAt: string;
}

export interface StoredKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim()).digest('hex');
}

function generateRawKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_ENTROPY_BYTES).toString('hex')}`;
}

/**
 * Mint a new API key for a user. Returns the raw key in the result
 * for one-time display. After this call the raw key is unrecoverable.
 */
export async function createApiKey(
  userId: string,
  name: string,
): Promise<CreateKeyResult> {
  const admin = getAdminClient();
  const trimmedName = name.trim().slice(0, 80) || 'Untitled key';

  // Three attempts in case of an astronomically unlikely hash collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const rawKey = generateRawKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 4); // "avak_live_a3f7"

    const { data, error } = await admin
      .from('api_keys')
      .insert({
        user_id: userId,
        name: trimmedName,
        key_hash: keyHash,
        key_prefix: keyPrefix,
      })
      .select('id, created_at')
      .single();

    if (!error && data) {
      return {
        rawKey,
        id: data.id as string,
        prefix: keyPrefix,
        name: trimmedName,
        createdAt: data.created_at as string,
      };
    }
    if (error && error.code !== '23505') {
      throw new Error(`createApiKey: ${error.message}`);
    }
    // 23505 is the unique-violation on key_hash. Astronomically rare;
    // retry generates a fresh key.
  }
  throw new Error('createApiKey: could not mint key after retries');
}

/**
 * List a user's keys. Includes revoked keys (the UI groups them).
 */
export async function listApiKeys(userId: string): Promise<StoredKey[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .select('id, user_id, name, key_prefix, last_used_at, revoked_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`listApiKeys: ${error.message}`);
  }
  return (data || []) as StoredKey[];
}

/**
 * Revoke a key. Soft-delete via revoked_at — preserves audit history
 * for "this key was used to fetch X at time Y" diagnostics later.
 * Idempotent: revoking an already-revoked key is a no-op success.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (error) {
    throw new Error(`revokeApiKey: ${error.message}`);
  }
}

/**
 * Verify a raw key against the store. Returns the owning user_id on
 * success, null otherwise. Bumps last_used_at fire-and-forget.
 * Constant-time-ish: we always do the hash + lookup so timing attacks
 * can't distinguish "unknown key" from "revoked key" by latency.
 */
export async function verifyApiKey(rawKey: string): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const admin = getAdminClient();
  const hash = hashKey(rawKey);
  const { data } = await admin
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;

  // Fire-and-forget last_used_at update so authentication isn't
  // slowed by a write. Errors are logged but don't fail the auth.
  void admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error }) => {
      if (error) {
        console.warn('[API_KEY_WARN]', { phase: 'last_used_update', message: error.message });
      }
    });

  return { userId: data.user_id as string, keyId: data.id as string };
}
