/** Snake demo 同一 HASH 的操作级镜像：字段 CAS 合并，仍是 best-effort，不是资产账本。 */
import { trackTask } from "../../../core/infra/lifecycle";
import { clientFor } from "../../../core/infra/redisRoute";
import { defineScript, evalshaWithReload } from "../../../core/infra/redisScripts";
import { kSnakeUser } from "./keys";

export type SnakeStoredField = "equippedSkinId" | "ownedSkinIds" | "fragmentBalances"
    | "snakeXp" | "achievementProgress" | "coinBalance";
const MAX_MERGE_ATTEMPTS = 8;
const MERGE_FIELDS = defineScript("snakeProfileFieldsCas", `
local patch = cjson.decode(ARGV[1])
for i, field in ipairs(patch.fields) do
    local previous = redis.call('HGET', KEYS[1], field)
    local expected = patch.before[i]
    if expected == cjson.null then
        if previous ~= false then return 0 end
    elseif previous ~= expected then return 0 end
end
local args = {}
for i, field in ipairs(patch.fields) do
    table.insert(args, field)
    table.insert(args, patch.after[i])
end
redis.call('HSET', KEYS[1], unpack(args))
return 1
`);

/** 只比较 / 写入操作拥有的字段；冲突重新读取后计算，不把过期快照盖回热档。 */
export async function mergeStoredSnakeFields(
    uid: string,
    fields: readonly SnakeStoredField[],
    merge: (before: readonly (string | null)[]) => readonly string[] | null,
): Promise<void> {
    const redis = clientFor(uid);
    const key = kSnakeUser(uid);
    for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt += 1) {
        const before = await redis.hmget(key, ...fields);
        const after = merge(before);
        if (after === null) return;
        if (after.length !== fields.length) throw new Error("Snake profile CAS field count mismatch");
        const applied = await evalshaWithReload(redis, MERGE_FIELDS, [key], [JSON.stringify({ fields, before, after })]);
        if (Number(applied) === 1) return;
    }
    throw new Error("Snake profile CAS contention exceeded demo retry budget");
}

const pendingWrites = new Map<string, Promise<void>>();

/** 同 uid 按调用顺序镜像，保留先奖励后消费的因果关系；同步 demo 回执不等待队列。 */
export function enqueueSnakeProfileWrite(uid: string, write: () => Promise<void>, reportError: (error: unknown) => void): void {
    const previous = pendingWrites.get(uid);
    let work: Promise<void>;
    try { work = previous ? previous.then(write) : write(); }
    catch (error) { work = Promise.reject(error); }
    const observed = trackTask("snake-profile-mirror", work.catch(reportError).finally(() => {
        if (pendingWrites.get(uid) === observed) pendingWrites.delete(uid);
    }));
    pendingWrites.set(uid, observed);
}

export async function drainSnakeProfileWrites(uid: string): Promise<void> {
    while (pendingWrites.has(uid)) await pendingWrites.get(uid);
}
