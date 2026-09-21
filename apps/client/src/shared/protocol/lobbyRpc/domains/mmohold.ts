/** mmohold.standings：holdRidge 各分线最新检查点的阵营比分与据点归属（MG2-B2，只读）。 */
import { assertExactKeys, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { defineLobbyRpcDomain, defineRpcQuery } from "../defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../primitives";

export const MMO_HOLD_PACK_ID = "holdRidge";
export const MMO_HOLD_MAP_ID = "holdRidge";
/** 与 kit orchestration 面 CHECKPOINTED_VARS_MAX_ROWS 交叉核对；shared 域不依赖 kit。 */
export const MMO_HOLD_STANDINGS_MAX_LINES = 64;
/** 保证 64 条分线相加仍为安全整数。正常一局在 100 分结算，远低于此线。 */
export const MMO_HOLD_STANDINGS_MAX_SCORE = Math.floor(Number.MAX_SAFE_INTEGER / MMO_HOLD_STANDINGS_MAX_LINES);
export const MMO_HOLD_FACTIONS = ["dawn", "dusk"] as const;
export type MmoHoldFaction = typeof MMO_HOLD_FACTIONS[number];
export type MmoHoldOwner = MmoHoldFaction | "neutral";

export const MmoHoldRpc = { Standings: "mmohold.standings" } as const;

export interface IMmoHoldStandingsReq { readonly [key: string]: never }
export interface MmoHoldScores { dawn: number; dusk: number }
export interface MmoHoldOwners { pointA: MmoHoldOwner; pointB: MmoHoldOwner }
export interface IMmoHoldStandingsLine {
    instanceId: string;
    /** 0 / 0 表示尚无分线检查点。 */
    rev: number;
    tick: number;
    scores: MmoHoldScores;
    owners: MmoHoldOwners;
}
export interface IMmoHoldStandingsRes {
    mapId: string;
    packId: string;
    /** 按分线实例 id 序，最多 64 行。 */
    lines: IMmoHoldStandingsLine[];
    /** 两阵营各自按 lines 累加；比分代表各分线当前轮次，不是历史战绩。 */
    totalScores: MmoHoldScores;
}
export interface MmoHoldRpcMap {
    [MmoHoldRpc.Standings]: { req: IMmoHoldStandingsReq; res: IMmoHoldStandingsRes };
}

export const validateMmoHoldStandingsReq: RuntimeValidator<IMmoHoldStandingsReq> = (input) => emptyPayload(input);

function scoresOf(input: unknown, path: string, max: number): MmoHoldScores {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["dawn", "dusk"], [], path);
    return { dawn: finiteInteger(value.dawn, `${path}.dawn`, 0, max), dusk: finiteInteger(value.dusk, `${path}.dusk`, 0, max) };
}

function ownerOf(input: unknown, path: string): MmoHoldOwner {
    if (input !== "neutral" && input !== "dawn" && input !== "dusk") throw new WireValidationError("MMO_HOLD_OWNER", path);
    return input;
}

export function validateMmoHoldStandingsLine(input: unknown, path: string): IMmoHoldStandingsLine {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["instanceId", "rev", "tick", "scores", "owners"], [], path);
    const owners = rpcRecord(value.owners, `${path}.owners`);
    assertExactKeys(owners, ["pointA", "pointB"], [], `${path}.owners`);
    return {
        instanceId: requiredId(value, "instanceId"),
        rev: finiteInteger(value.rev, `${path}.rev`, 0),
        tick: finiteInteger(value.tick, `${path}.tick`, 0),
        scores: scoresOf(value.scores, `${path}.scores`, MMO_HOLD_STANDINGS_MAX_SCORE),
        owners: { pointA: ownerOf(owners.pointA, `${path}.owners.pointA`), pointB: ownerOf(owners.pointB, `${path}.owners.pointB`) },
    };
}

export const validateMmoHoldStandingsRes: RuntimeValidator<IMmoHoldStandingsRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["mapId", "packId", "lines", "totalScores"], [], "response");
    const mapId = requiredId(value, "mapId");
    const packId = requiredId(value, "packId");
    if (mapId !== MMO_HOLD_MAP_ID || packId !== MMO_HOLD_PACK_ID) throw new WireValidationError("MMO_HOLD_STANDINGS_SCOPE", "response");
    if (!Array.isArray(value.lines) || value.lines.length > MMO_HOLD_STANDINGS_MAX_LINES) throw new WireValidationError("MMO_HOLD_STANDINGS_SIZE", "response.lines");
    const lines = value.lines.map((line, index) => validateMmoHoldStandingsLine(line, `response.lines[${index}]`));
    const seen = new Set<string>();
    for (const line of lines) {
        if (seen.has(line.instanceId)) throw new WireValidationError("MMO_HOLD_STANDINGS_DUP", "response.lines");
        seen.add(line.instanceId);
    }
    const totalScores = scoresOf(value.totalScores, "response.totalScores", Number.MAX_SAFE_INTEGER);
    for (const faction of MMO_HOLD_FACTIONS) {
        if (totalScores[faction] !== lines.reduce((sum, line) => sum + line.scores[faction], 0)) throw new WireValidationError("MMO_HOLD_STANDINGS_TOTAL", `response.totalScores.${faction}`);
    }
    return { mapId, packId, lines, totalScores };
};

export default defineLobbyRpcDomain({
    domain: "mmohold",
    contractVersion: 1,
    errorCodes: [],
    pushes: [],
    routes: [defineRpcQuery(MmoHoldRpc.Standings, { request: validateMmoHoldStandingsReq, response: validateMmoHoldStandingsRes })],
});
