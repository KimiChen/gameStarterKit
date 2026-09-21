import { syncVersions, type ILobbyDataSync } from "../shared/index";

/**
 * reply.sync 与主动 sync 帧的唯一客户端入口。模块版本相同或倒退时不重复通知；版本跳跃
 * 保留最新已验证差异并通知观察者，由领域侧在需要权威全量时自行刷新。
 */
export class LobbyDataSyncStore {
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<(sync: ILobbyDataSync) => void>();
  private latestSync: ILobbyDataSync | null = null;

  apply(sync: ILobbyDataSync): void {
    const incoming = syncVersions(sync);
    const names = Object.keys(incoming);
    if (names.length > 0) {
      let changed = false;
      for (const name of names) {
        const version = incoming[name];
        const current = this.versions.get(name) ?? -1;
        if (version > current) {
          this.versions.set(name, version);
          changed = true;
        }
      }
      if (!changed) return;
    }
    this.latestSync = sync;
    for (const listener of this.listeners) listener(sync);
  }

  latest(): ILobbyDataSync | null { return this.latestSync; }

  subscribe(listener: (sync: ILobbyDataSync) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.versions.clear();
    this.latestSync = null;
  }
}

export const lobbyDataSync = new LobbyDataSyncStore();
