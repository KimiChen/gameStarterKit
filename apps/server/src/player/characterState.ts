import { clientFor } from "../core/infra/redisRoute";
import { kUser, zoneCtx } from "../core/infra/keys";
import { defineScript, evalshaWithReload } from "../core/infra/redisScripts";
import { loadFields } from "../core/userRecord";

export type CharacterRegistrationState = "pending" | "ready" | null;

const MARK_CHARACTER_READY = defineScript("markCharacterRegistrationReady", `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], 'characterRegistration', ARGV[1])
return 1
`);

export async function readCharacterRegistration(
  uid: string,
  sId: number,
): Promise<CharacterRegistrationState> {
  return zoneCtx.run({ sId }, async () => {
    const fields = await loadFields(uid, ["characterRegistration"]);
    const value = fields.characterRegistration;
    return value === "pending" || value === "ready" ? value : null;
  });
}

/**
 * Only mark an existing profile.  A stale repair intent must never create a
 * new Redis user hash by itself.
 */
export async function markCharacterRegistrationReady(uid: string, sId: number): Promise<void> {
  await zoneCtx.run({ sId }, async () => {
    const client = clientFor(uid);
    await evalshaWithReload(
      client,
      MARK_CHARACTER_READY,
      [kUser(uid)],
      ["ready"],
    );
  });
}
