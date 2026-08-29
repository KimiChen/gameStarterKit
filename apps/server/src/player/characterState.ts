import { clientFor } from "../core/infra/redisRoute";
import { kLock, kUser, zoneCtx } from "../core/infra/keys";
import { defineScript, evalshaWithReload } from "../core/infra/redisScripts";
import { loadFields } from "../core/userRecord";
import { ensureLive } from "../core/archive/thaw";
import { withUserLock } from "../core/locks";
import { BusyError } from "../core/errors";
import { SCHEMA_VERSION } from "../core/infra/config";
import { migrateLiveUserSchemaLocked } from "../core/liveSchema";

export type CharacterRegistrationState = "pending" | "ready" | null;

export interface CharacterRegistrationInfo {
  readonly state: CharacterRegistrationState;
  /** Unix epoch milliseconds of the last authoritative external check/PUT. */
  readonly checkedAtMs: number | null;
}

/** Test-only race injection; production leaves it empty. */
export const _characterStateTestHooks: {
  afterEnsureLive?: (uid: string, sId: number) => Promise<void>;
} = {};

const MARK_CHARACTER_READY = defineScript("markCharacterRegistrationReady", `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lost' end
if redis.call('EXISTS', KEYS[2]) == 0 then return 'cold' end
if redis.call('HGET', KEYS[2], 'schemaVersion') ~= '${SCHEMA_VERSION}' then
  return redis.error_reply('character marker schema invalid')
end
local oldState = redis.call('HGET', KEYS[2], 'characterRegistration')
local oldCheckedAt = redis.call('HGET', KEYS[2], 'characterRegistrationCheckedAt')
if oldState == ARGV[2] and oldCheckedAt == ARGV[3] then return 'ok' end
local rawVer = redis.call('HGET', KEYS[2], 'ver')
if rawVer == false then return redis.error_reply('character marker ver invalid') end
local ver = tonumber(rawVer)
if ver == nil or ver < 0 or ver ~= math.floor(ver) or ver >= 9007199254740991 then
  return redis.error_reply('character marker ver invalid')
end
redis.call('HSET', KEYS[2], 'characterRegistration', ARGV[2], 'characterRegistrationCheckedAt', ARGV[3])
redis.call('HSET', KEYS[2], 'ver', tostring(ver + 1))
return 'ok'
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
    for (let attempt = 0; attempt < 2; attempt++) {
      await ensureLive(uid, sId);
      if (_characterStateTestHooks.afterEnsureLive) {
        await _characterStateTestHooks.afterEnsureLive(uid, sId);
      }
      const result = await withUserLock(uid, async (fence) => {
        await migrateLiveUserSchemaLocked(uid, fence);
        return evalshaWithReload(
          clientFor(uid),
          MARK_CHARACTER_READY,
          [kLock(uid), kUser(uid)],
          [String(fence), "ready", String(checkedAtMs)],
        );
      });
      if (result === "ok") { return; }
      if (result === "cold") { continue; }
      throw new BusyError(`character marker lost uid=${uid} sId=${sId}`);
    }
    throw new BusyError(`character marker remained cold uid=${uid} sId=${sId}`);
  });
}
