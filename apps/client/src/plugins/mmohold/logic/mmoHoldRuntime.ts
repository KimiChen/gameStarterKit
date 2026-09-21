/** PluginHost 注入；身份守卫避免旧 module 注销清掉新 runtime。 */
import type { IMmoHoldStandingsRes } from "../../../shared/protocol/lobbyRpc/domains/mmohold";
import type { CreateCharacterInput, IMmoCharactersRes, IMmoCreateCharacterRes } from "../../../kits/mmo/api/characters/index";

export interface MmoHoldRuntime {
    standings(): Promise<IMmoHoldStandingsRes>;
    selfUid(): string;
    characters(): Promise<IMmoCharactersRes>;
    createCharacter(input: CreateCharacterInput): Promise<IMmoCreateCharacterRes>;
    enter(characterId: string): Promise<void>;
    close(): void;
}

let current: MmoHoldRuntime | null = null;
export function setMmoHoldRuntime(runtime: MmoHoldRuntime): () => void {
    current = runtime;
    return () => { if (current === runtime) current = null; };
}
export function getMmoHoldRuntime(): MmoHoldRuntime | null { return current; }
