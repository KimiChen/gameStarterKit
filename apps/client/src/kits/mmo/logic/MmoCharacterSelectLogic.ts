/**
 * 选角页逻辑（纯 TS，无头单测）：加载角色 → 槽位视图（角色 / 孤儿 / 空槽）→ 建角（在途闸）→ 进入世界（带参 launch mmoWorld）。
 * 渲染归 ../view/MmoCharacterSelectView.ts；⛔ 不 import cc。错误分支只按 RpcError.code 分派，⛔ 不解析错误文案。
 */
import { DEFAULT_MAP_ID } from "../api/content/index";
import { characterSlots, defaultCharacterName, describeCharacter, type CharacterSlotView, type ICharacterSummary } from "../api/characters/index";
import type { MmoRuntime } from "./mmoRuntime";

export type MmoNoticeKind = "idle" | "success" | "error";

export interface MmoNotice {
    readonly kind: MmoNoticeKind;
    readonly text: string;
}

const IDLE: MmoNotice = { kind: "idle", text: "选一个角色进入世界，或在空槽建角" };
const NOT_READY: MmoNotice = { kind: "error", text: "MMO 未就绪（kit 未装载）" };

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeMmoError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "MMO_NAME_TAKEN": return "这个名字已被占用，换一个";
        case "MMO_SLOT_TAKEN": return "这个槽位已有角色";
        case "MMO_SLOTS_FULL": return "角色数已达上限";
        case "WORLD_LINE_UNAVAILABLE": return "分线已满，稍后再试";
        case "WORLD_TRANSFER_INVALID": return "角色正在交接中，稍后再试";
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后重试（已发出的操作不会重复）";
        default: return code ? `操作失败（${code}）` : "操作失败，请稍后重试";
    }
}

export class MmoCharacterSelectLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private characters: ICharacterSummary[] = [];
    private orphans: { readonly personaId: string; readonly slot: number }[] = [];
    private maxSlots = 0;
    private loaded = false;
    private busy = false;
    private notice: MmoNotice;

    constructor(private readonly runtime: MmoRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.loaded; }
    currentNotice(): MmoNotice { return this.notice; }
    slots(): CharacterSlotView[] { return characterSlots(this.characters, this.orphans, this.maxSlots || undefined); }
    describe(character: ICharacterSummary): string { return describeCharacter(character); }

    canCreate(slot: number): boolean {
        if (this.runtime === null || this.busy || !this.loaded) return false;
        return this.slots().some((view) => view.slot === slot && view.kind === "empty");
    }

    canEnter(characterId: string): boolean {
        if (this.runtime === null || this.busy || !this.loaded) return false;
        return this.characters.some((character) => character.characterId === characterId && character.status === "active");
    }

    /** 加载 / 刷新角色列表：失败写提示，保留旧列表。 */
    async refresh(keepNotice = false): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.characters();
            this.characters = result.characters;
            this.orphans = result.orphans;
            this.maxSlots = result.maxSlots;
            this.loaded = true;
            return true;
        } catch (error) {
            if (!keepNotice) this.notice = { kind: "error", text: describeMmoError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /** 建角（灰盒：槽位派生的默认名 / 战士 / dawn；正式命名 UI 归内容插件）。 */
    async create(slot: number): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || !this.canCreate(slot)) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.createCharacter({ slot, name: defaultCharacterName(slot, runtime.selfUid()), classId: "fighter", factionId: "dawn" });
            this.characters = [...this.characters.filter((character) => character.slot !== slot), result.character].sort((left, right) => left.slot - right.slot);
            this.notice = { kind: "success", text: `已创建 ${result.character.name}` };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeMmoError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /** 进入世界：角色有最新检查点图就回那张图，否则首图；带参 launch 交给宿主（joiner 再 world.enter）。 */
    async enter(characterId: string): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || !this.canEnter(characterId)) return false;
        const character = this.characters.find((entry) => entry.characterId === characterId)!;
        this.busy = true;
        this.onChanged();
        try {
            await runtime.launchWorld(characterId, character.mapId ?? DEFAULT_MAP_ID);
            this.notice = { kind: "success", text: `进入 ${character.mapId ?? DEFAULT_MAP_ID}` };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeMmoError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    close(): void {
        this.runtime?.close();
    }
}
