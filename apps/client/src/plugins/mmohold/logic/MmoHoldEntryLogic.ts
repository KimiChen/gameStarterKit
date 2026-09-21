/** 比分页内的角色入口，只消费 kit characters 面。 */
import { characterSlots, defaultCharacterName, type ICharacterSummary, type IMmoCharactersRes, type MmoFactionId } from "../../../kits/mmo/api/characters/index";
import type { MmoHoldRuntime } from "./mmoHoldRuntime";
import { describeHoldOwner, describeStandingsError } from "./MmoHoldStandingsLogic";

export class MmoHoldEntryLogic {
    onChanged: () => void = () => {};
    private snapshot: IMmoCharactersRes | null = null;
    private busy = false;
    private message: string;
    constructor(private readonly runtime: MmoHoldRuntime | null) { this.message = runtime ? "读取角色中…" : "角色入口未就绪"; }
    isBusy(): boolean { return this.busy; }
    notice(): string { return this.message; }
    characters(): readonly ICharacterSummary[] { return this.snapshot?.characters ?? []; }
    emptySlot(): number | null {
        if (!this.snapshot) return null;
        return characterSlots(this.snapshot.characters, this.snapshot.orphans, this.snapshot.maxSlots).find((slot) => slot.kind === "empty")?.slot ?? null;
    }
    canCreate(): boolean { return this.runtime !== null && !this.busy && this.emptySlot() !== null; }
    canEnter(characterId: string): boolean { return !this.busy && this.characters().some((character) => character.characterId === characterId && character.status === "active"); }
    async refresh(): Promise<boolean> {
        if (!this.runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            this.snapshot = await this.runtime.characters();
            this.message = this.characters().length ? "选择角色进入 holdRidge 据点争夺" : "先选择阵营建角，再进入争夺";
            return true;
        } catch (error) { this.message = describeStandingsError(error); return false; }
        finally { this.busy = false; this.onChanged(); }
    }
    async create(factionId: MmoFactionId): Promise<boolean> {
        const slot = this.emptySlot();
        if (!this.runtime || !this.canCreate() || slot === null || !this.snapshot) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await this.runtime.createCharacter({ slot, name: defaultCharacterName(slot, this.runtime.selfUid()), classId: "fighter", factionId });
            this.snapshot = { ...this.snapshot, characters: [...this.snapshot.characters.filter((character) => character.slot !== slot), result.character].sort((left, right) => left.slot - right.slot) };
            this.message = `已创建 ${describeHoldOwner(factionId)}角色 ${result.character.name}`;
            return true;
        } catch (error) { this.message = describeStandingsError(error); return false; }
        finally { this.busy = false; this.onChanged(); }
    }
    async enter(characterId: string): Promise<boolean> {
        if (!this.runtime || !this.canEnter(characterId)) return false;
        this.busy = true;
        this.onChanged();
        try {
            await this.runtime.enter(characterId);
            this.runtime.close();
            return true;
        } catch (error) { this.message = describeStandingsError(error); return false; }
        finally { this.busy = false; this.onChanged(); }
    }
}
