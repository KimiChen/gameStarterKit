/**
 * mmodemo 域 ws-RPC 契约——MMO 内容插件样本 1（apps/plugins/mmodemo）的可选自有域（docs/MMO.md §9.2「自有域（可选）」；MMO-PLAN MG1-B2）。
 * 只用框架助手；⛔ 不 import kit 模块（服务端读检查点走 kit `orchestration` 面 v2 `listCheckpointedVars`）。
 * 执行模式：BossBoard=query（灰谷 demoVale 各分线最新检查点里编排 durable var `bossKills` 的战报；只读、无参数、无错误码）。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../primitives";

/** 本插件内容包 / 主图 id（与 content/pack.json、编排 DEMO_VALE_PACK_ID 同值；用例交叉核对，⛔ 各自漂移） */
export const MMO_DEMO_PACK_ID = "demoVale";
export const MMO_DEMO_MAP_ID = "demoVale";
/** 战报最多几条分线（= kit orchestration 面 CHECKPOINTED_VARS_MAX_ROWS；域文件 ⛔ import kit，用例交叉核对） */
export const MMO_DEMO_BOSS_BOARD_MAX_LINES = 64;

/** mmodemo 域路由名 */
export const MmoDemoRpc = {
    /** 灰谷各分线的头狼击杀战报 */
    BossBoard: "mmodemo.bossBoard",
} as const;

export interface IMmoDemoBossBoardReq {
    readonly [key: string]: never;
}
export interface IMmoDemoBossBoardLine {
    /** 框架分线实例 id（不透明；客户端只展示末几位） */
    instanceId: string;
    /** 最新分线检查点 rev / 分线 tick；0 / 0 = 尚无检查点 */
    rev: number;
    tick: number;
    /** 编排 durable var bossKills（头狼击杀累计；无 / 非法 ⇒ 0） */
    bossKills: number;
}
export interface IMmoDemoBossBoardRes {
    mapId: string;
    packId: string;
    /** 按分线实例 id 序；≤ MMO_DEMO_BOSS_BOARD_MAX_LINES */
    lines: IMmoDemoBossBoardLine[];
    /** 全分线击杀合计（= Σ lines[].bossKills） */
    totalKills: number;
}

/** 路由名 → { req, res } */
export interface MmoDemoRpcMap {
    [MmoDemoRpc.BossBoard]: { req: IMmoDemoBossBoardReq; res: IMmoDemoBossBoardRes };
}

export const validateMmoDemoBossBoardReq: RuntimeValidator<IMmoDemoBossBoardReq> = (input) => emptyPayload(input);

export function validateMmoDemoBossBoardLine(input: unknown, path: string): IMmoDemoBossBoardLine {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["instanceId", "rev", "tick", "bossKills"], [], path);
    return {
        instanceId: requiredId(value, "instanceId"),
        rev: finiteInteger(value.rev, `${path}.rev`, 0),
        tick: finiteInteger(value.tick, `${path}.tick`, 0),
        bossKills: finiteInteger(value.bossKills, `${path}.bossKills`, 0),
    };
}

export const validateMmoDemoBossBoardRes: RuntimeValidator<IMmoDemoBossBoardRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["mapId", "packId", "lines", "totalKills"], [], "response");
    if (!Array.isArray(value.lines) || value.lines.length > MMO_DEMO_BOSS_BOARD_MAX_LINES) throw new WireValidationError("MMO_DEMO_BOSS_BOARD_SIZE", "response.lines");
    const lines = value.lines.map((item, index) => validateMmoDemoBossBoardLine(item, `response.lines[${index}]`));
    const seen = new Set<string>();
    for (const line of lines) {
        if (seen.has(line.instanceId)) throw new WireValidationError("MMO_DEMO_BOSS_BOARD_DUP", "response.lines");
        seen.add(line.instanceId);
    }
    const totalKills = finiteInteger(value.totalKills, "response.totalKills", 0);
    if (totalKills !== lines.reduce((sum, line) => sum + line.bossKills, 0)) throw new WireValidationError("MMO_DEMO_BOSS_BOARD_TOTAL", "response.totalKills");
    return { mapId: requiredId(value, "mapId"), packId: requiredId(value, "packId"), lines, totalKills };
};

export default defineLobbyRpcDomain({
    domain: "mmodemo",
    contractVersion: 1,
    errorCodes: [],
    pushes: [],
    routes: [
        defineRpcQuery(MmoDemoRpc.BossBoard, { request: validateMmoDemoBossBoardReq, response: validateMmoDemoBossBoardRes }),
    ],
});
