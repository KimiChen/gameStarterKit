import {
    SeededRandom,
    SKILL_TABLE,
    type ILoginRes,
    type IPlayerProfile,
} from "@game/shared";

/**
 * 假数据生成器 —— 全部为内存 mock，进程重启即重置。
 */

const NICK_PREFIX = ["快乐", "无敌", "神秘", "暴走", "咸鱼", "低调", "闪电", "锦鲤"];
const NICK_SUFFIX = ["小汉字", "词王", "笔画侠", "拼音怪", "部首君", "成语精"];

export function randomNickname(rng: SeededRandom): string {
    return `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_SUFFIX)}`;
}

let nextUserId = 10001;
/** token → openId 的内存会话表 */
const sessions = new Map<string, string>();
/** openId → 档案 */
const profiles = new Map<string, IPlayerProfile>();

export function mockLogin(_code: string): ILoginRes {
    const openId = `mock-openid-${nextUserId++}`;
    const token = `mock-token-${Math.random().toString(36).slice(2, 10)}`;
    sessions.set(token, openId);

    const rng = new SeededRandom(nextUserId);
    profiles.set(openId, {
        openId,
        nickname: randomNickname(rng),
        level: rng.nextInt(1, 30),
        exp: rng.nextInt(0, 1000),
        gold: rng.nextInt(100, 99999),
        skills: SKILL_TABLE.map((s) => s.id),
    });

    return { openId, token, isNew: true };
}

export function mockProfileByToken(token: string): IPlayerProfile | undefined {
    const openId = sessions.get(token);
    if (!openId) return undefined;
    return profiles.get(openId);
}

