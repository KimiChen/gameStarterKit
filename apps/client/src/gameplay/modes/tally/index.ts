/**
 * tally 客户端 GameplayModule（plugins/tally）：纯装配层——transport（net/rooms/TallyRoom）与玩法实现
 * （logic/rooms/tally）组装成 §7.6 的模块形状；presentation 经字面量动态 import（铁律 10）。
 * 新增玩法照抄本目录形态，⛔ 不修改 Main / RoomClient / catalog 中央文件。
 */
import { createTallyGameplay, TALLY_GAMEPLAY_ID, type TallyInput, type TallyPresentation, type TallyRoom } from "../../../logic/rooms/tally/TallyGameplay";
import type { GameplayInstanceHost, GameplayModule } from "../../../logic/gameplay/index";
import { createTallyRoomAdapter, createTallyRoomJoiner } from "../../../net/rooms/TallyRoom";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface TallyLaunch {
    readonly profile?: string;
}

function validateTallyLaunch(input: unknown): TallyLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[tally] launch 必须是对象");
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(`[tally] launch 未知字段：${key}`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.tally.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[tally] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

/** generated catalog 的约定入口：注入稳定服务，返回本玩法的模块。 */
export function createGameplayModule(services: GameplayServicesContext): GameplayModule<TallyLaunch, TallyInput, TallyRoom> {
    const adapter = createTallyRoomAdapter();
    const roomJoiner = createTallyRoomJoiner(adapter, services.roomClient);
    return {
        id: TALLY_GAMEPLAY_ID,
        validateLaunch: validateTallyLaunch,
        joiner: {
            join: (_launch, signal) => roomJoiner.join(signal),
        },
        createPlugin: (host) => createTallyGameplay({
            host,
            ...(services.presentationHost ? { presentationFactory: () => createTallyPresentation(services, host) } : {}),
        }),
    };
}

async function createTallyPresentation(
    services: GameplayServicesContext,
    host: GameplayInstanceHost<TallyInput>,
): Promise<TallyPresentation | undefined> {
    const presentationHost = services.presentationHost;
    if (!presentationHost) return undefined;
    const { TallyView } = await import("../../../view/rooms/tally/TallyView");
    return new TallyView(presentationHost.node, (input) => {
        void host.dispatchInput(input).catch((error) => {
            console.error("[tally] gameplay input 失败：", error);
        });
    });
}
