import {
  syncVersions,
  type ILobbyDataSync,
  type LobbySyncValue,
} from "../shared/index";

/**
 * reply.sync 与主动 sync 帧的唯一客户端入口。模块版本相同或倒退时不重复通知；版本跳跃
 * 保留最新已验证差异并通知观察者，由领域侧在需要权威全量时自行刷新。
 */
export class LobbyDataSyncStore {
  private readonly versions = new Map<string, number>();
  private readonly modules = new Map<string, LobbySyncValue>();
  private readonly staleModules = new Set<string>();
  private readonly listeners = new Set<(sync: ILobbyDataSync) => void>();
  private readonly moduleListeners = new Map<
    string,
    Set<(value: LobbySyncValue | undefined) => void>
  >();
  private latestSync: ILobbyDataSync | null = null;

  apply(sync: ILobbyDataSync): void {
    const incoming = syncVersions(sync);
    let changed = false;
    for (const [name, value] of Object.entries(sync.mods)) {
      if (name === "versions") continue;
      const version = incoming[name];
      const current = this.versions.get(name) ?? -1;
      if (version !== undefined && version <= current) continue;
      if (version !== undefined) {
        if (current >= 0 && version > current + 1) this.staleModules.add(name);
        this.versions.set(name, version);
      }
      const cloned = cloneSyncValue(value);
      this.modules.set(name, cloned);
      changed = true;
      for (const listener of this.moduleListeners.get(name) ?? []) listener(cloned);
    }
    if (!changed && Object.keys(incoming).length > 0) return;
    this.latestSync = sync;
    for (const listener of this.listeners) listener(sync);
  }

  latest(): ILobbyDataSync | null { return this.latestSync; }

  module<T extends LobbySyncValue = LobbySyncValue>(name: string): T | undefined {
    return this.modules.get(name) as T | undefined;
  }

  version(name: string): number | undefined { return this.versions.get(name); }

  isStale(name: string): boolean { return this.staleModules.has(name); }

  field<T = LobbySyncValue>(fieldName: string): T | undefined {
    for (const value of this.modules.values()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (Object.prototype.hasOwnProperty.call(value, fieldName)) {
        return (value as { [key: string]: LobbySyncValue })[fieldName] as T;
      }
    }
    return undefined;
  }

  subscribe(listener: (sync: ILobbyDataSync) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeModule(
    name: string,
    listener: (value: LobbySyncValue | undefined) => void,
  ): () => void {
    let listeners = this.moduleListeners.get(name);
    if (!listeners) {
      listeners = new Set();
      this.moduleListeners.set(name, listeners);
    }
    listeners.add(listener);
    listener(this.modules.get(name));
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.moduleListeners.delete(name);
    };
  }

  reset(): void {
    this.versions.clear();
    this.modules.clear();
    this.staleModules.clear();
    this.latestSync = null;
  }
}

export const lobbyDataSync = new LobbyDataSyncStore();

function cloneSyncValue(value: LobbySyncValue): LobbySyncValue {
  if (Array.isArray(value)) return value.map(cloneSyncValue);
  if (value && typeof value === "object") {
    const output: { [key: string]: LobbySyncValue } = {};
    for (const [key, nested] of Object.entries(value)) output[key] = cloneSyncValue(nested);
    return output;
  }
  return value;
}
