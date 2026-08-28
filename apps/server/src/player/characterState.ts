import { clientFor } from "../core/infra/redisRoute";
import { kUser, zoneCtx } from "../core/infra/keys";
import { defineScript, evalshaWithReload } from "../core/infra/redisScripts";
import { loadFields } from "../core/userRecord";

export type CharacterRegistrationState = "pending" | "ready" | null;

export interface CharacterRegistrationInfo {
  readonly state: CharacterRegistrationState;
  /** Unix epoch milliseconds of the last authoritative external check/PUT. */
  readonly checkedAtMs: number | null;
}

const MARK_CHARACTER_READY = defineScript("markCharacterRegistrationReady", `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], 'characterRegistration', ARGV[1], 'characterRegistrationCheckedAt', ARGV[2])
return 1
`);

const parseCheckedAt = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) { return null; }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function readCharacterRegistration(
  uid: string,
  sId: number,
): Promise<CharacterRegistrationInfo> {
  return zoneCtx.run({ sId }, async () => {
    const fields = await loadFields(uid, ["characterRegistration", "characterRegistrationCheckedAt"]);
    const value = fields.characterRegistration;
    return {
      state: value === "pending" || value === "ready" ? value : null,
      checkedAtMs: parseCheckedAt(fields.characterRegistrationCheckedAt),
    };
  });
}

/**
 * Only mark an existing profile.  A stale repair intent must never create a
 * new Redis user hash by itself.
 */
export async function markCharacterRegistrationReady(
  uid: string,
  sId: number,
  checkedAtMs = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(checkedAtMs) || checkedAtMs < 0) {
    throw new RangeError(`characterRegistrationCheckedAt 非法：${String(checkedAtMs)}`);
  }
  await zoneCtx.run({ sId }, async () => {
    const client = clientFor(uid);
    await evalshaWithReload(
      client,
      MARK_CHARACTER_READY,
      [kUser(uid)],
      ["ready", String(checkedAtMs)],
    );
  });
}
