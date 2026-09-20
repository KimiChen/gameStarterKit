/**
 * party Lua（docs/MMO.md §6.4；MF6a-B3）。KEYS 恒为五键同槽 `[kParty, kPartyMembers, kPartyInvites, kPartyEvtSeq, kPartyEvtLog]`；
 * 每条：校验 → 变更 → `HINCRBY ver` → 事件（Lua 内 INCR seq + LPUSH/LTRIM，⛔ 无 guild 那样的 seq 空洞）→ PEXPIRE 全族
 * （或最后一人离开 DEL 全族）。返回 `{code, seq, extra}`：code 1 ok / 2 ok 且已解散；负数见 PARTY_LUA_CODE。
 * 时间由调用方传入（ARGV nowMs）：五键同槽的写脚本里 `TIME` 与确定性无关，但统一走调用方时钟便于测试（邀请过期等）。
 */
import { defineScript } from "../infra/redisScripts";

export const PARTY_LUA_CODE = {
  OK: 1,
  OK_DISBANDED: 2,
  NOT_FOUND: -1,
  NOT_MEMBER: -2,
  FULL: -3,
  ALREADY_IN_PARTY: -4,
  INVITE_INVALID: -5,
  NOT_LEADER: -6,
} as const;

/** 公共前奏：事件 / 续期 / 存在性。ARGV 尾三项固定 = nowMs, ttlMs, logMax（各脚本按自己的位次读）。 */
const PRELUDE = `
local function emit(kind, dataJson, nowMs, logMax)
  local seq = redis.call('INCR', KEYS[4])
  local evt = '{"seq":' .. seq .. ',"kind":"' .. kind .. '","at":' .. nowMs .. ',"data":' .. dataJson .. '}'
  redis.call('LPUSH', KEYS[5], evt)
  redis.call('LTRIM', KEYS[5], 0, tonumber(logMax) - 1)
  return seq
end
local function touch(ttlMs, nowMs)
  redis.call('HSET', KEYS[1], 'updatedAt', nowMs)
  for i = 1, 5 do redis.call('PEXPIRE', KEYS[i], ttlMs) end
end
local function jstr(s)
  return '"' .. string.gsub(s, '["\\\\]', '\\\\%0') .. '"'
end
`;

/** ARGV = [leaderUid, maxSize, nowMs, ttlMs, logMax] */
export const PARTY_CREATE = defineScript("partyCreate", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 1 then return {-4, 0, ''} end
redis.call('HSET', KEYS[1], 'leader', ARGV[1], 'maxSize', ARGV[2], 'ver', 1, 'createdAt', ARGV[3], 'updatedAt', ARGV[3])
redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[1])
local seq = emit('created', '{"uid":' .. jstr(ARGV[1]) .. '}', ARGV[3], ARGV[5])
touch(ARGV[4], ARGV[3])
return {1, seq, ''}
`);

/** ARGV = [byUid, inviteeUid, nowMs, expAt, ttlMs, logMax] */
export const PARTY_INVITE = defineScript("partyInvite", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
if redis.call('ZSCORE', KEYS[2], ARGV[1]) == false then return {-2, 0, ''} end
if redis.call('ZSCORE', KEYS[2], ARGV[2]) ~= false then return {-4, 0, ''} end
local maxSize = tonumber(redis.call('HGET', KEYS[1], 'maxSize'))
if redis.call('ZCARD', KEYS[2]) >= maxSize then return {-3, 0, ''} end
redis.call('HSET', KEYS[3], ARGV[2], '{"by":' .. jstr(ARGV[1]) .. ',"at":' .. ARGV[3] .. ',"expAt":' .. ARGV[4] .. '}')
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('invited', '{"uid":' .. jstr(ARGV[2]) .. ',"by":' .. jstr(ARGV[1]) .. '}', ARGV[3], ARGV[6])
touch(ARGV[5], ARGV[3])
return {1, seq, ''}
`);

/** ARGV = [uid, nowMs, ttlMs, logMax] */
export const PARTY_ACCEPT = defineScript("partyAccept", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
local raw = redis.call('HGET', KEYS[3], ARGV[1])
if raw == false then return {-5, 0, ''} end
local invite = cjson.decode(raw)
if tonumber(invite.expAt) < tonumber(ARGV[2]) then
  redis.call('HDEL', KEYS[3], ARGV[1])
  return {-5, 0, ''}
end
if redis.call('ZSCORE', KEYS[2], ARGV[1]) ~= false then
  redis.call('HDEL', KEYS[3], ARGV[1])
  return {-4, 0, ''}
end
local maxSize = tonumber(redis.call('HGET', KEYS[1], 'maxSize'))
if redis.call('ZCARD', KEYS[2]) >= maxSize then return {-3, 0, ''} end
redis.call('ZADD', KEYS[2], tonumber(ARGV[2]), ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('memberJoin', '{"uid":' .. jstr(ARGV[1]) .. '}', ARGV[2], ARGV[4])
touch(ARGV[3], ARGV[2])
return {1, seq, ''}
`);

/** ARGV = [uid, nowMs, ttlMs, logMax] */
export const PARTY_DECLINE = defineScript("partyDecline", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
if redis.call('HDEL', KEYS[3], ARGV[1]) == 0 then return {1, 0, ''} end
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('inviteDeclined', '{"uid":' .. jstr(ARGV[1]) .. '}', ARGV[2], ARGV[4])
touch(ARGV[3], ARGV[2])
return {1, seq, ''}
`);

/** ARGV = [uid, nowMs, ttlMs, logMax]；返回 extra = 新队长 uid（未换则空串）。 */
export const PARTY_LEAVE = defineScript("partyLeave", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
if redis.call('ZREM', KEYS[2], ARGV[1]) == 0 then return {-2, 0, ''} end
if redis.call('ZCARD', KEYS[2]) == 0 then
  for i = 1, 5 do redis.call('DEL', KEYS[i]) end
  return {2, 0, ''}
end
local newLeader = ''
if redis.call('HGET', KEYS[1], 'leader') == ARGV[1] then
  newLeader = redis.call('ZRANGE', KEYS[2], 0, 0)[1]
  redis.call('HSET', KEYS[1], 'leader', newLeader)
end
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('memberLeave', '{"uid":' .. jstr(ARGV[1]) .. '}', ARGV[2], ARGV[4])
if newLeader ~= '' then
  seq = emit('leaderChanged', '{"uid":' .. jstr(newLeader) .. '}', ARGV[2], ARGV[4])
end
touch(ARGV[3], ARGV[2])
return {1, seq, newLeader}
`);

/** ARGV = [leaderUid, targetUid, nowMs, ttlMs, logMax] */
export const PARTY_KICK = defineScript("partyKick", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
if redis.call('HGET', KEYS[1], 'leader') ~= ARGV[1] then return {-6, 0, ''} end
if ARGV[1] == ARGV[2] then return {-2, 0, ''} end
if redis.call('ZREM', KEYS[2], ARGV[2]) == 0 then return {-2, 0, ''} end
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('memberKicked', '{"uid":' .. jstr(ARGV[2]) .. ',"by":' .. jstr(ARGV[1]) .. '}', ARGV[3], ARGV[5])
touch(ARGV[4], ARGV[3])
return {1, seq, ''}
`);

/** ARGV = [leaderUid, targetUid, nowMs, ttlMs, logMax] */
export const PARTY_TRANSFER = defineScript("partyTransfer", `${PRELUDE}
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1, 0, ''} end
if redis.call('HGET', KEYS[1], 'leader') ~= ARGV[1] then return {-6, 0, ''} end
if redis.call('ZSCORE', KEYS[2], ARGV[2]) == false then return {-2, 0, ''} end
redis.call('HSET', KEYS[1], 'leader', ARGV[2])
redis.call('HINCRBY', KEYS[1], 'ver', 1)
local seq = emit('leaderChanged', '{"uid":' .. jstr(ARGV[2]) .. ',"by":' .. jstr(ARGV[1]) .. '}', ARGV[3], ARGV[5])
touch(ARGV[4], ARGV[3])
return {1, seq, ''}
`);
