/** gameDemo plugin：把宿主 Lobby / 同步 / 时钟 / 导航 ports 组装成 Runtime，业务不进入 app 框架。 */
import type { PluginModule } from "../../app/PluginHost";
import { lobbyDataSync } from "../../net/LobbyDataSync";
import { GameDemoRpc } from "../../shared/protocol/lobbyRpc/domains/gameDemo";
import { setGameDemoRuntime } from "./logic/gameDemoRuntime";

/** 服务端 `GameDemoBossRoom` Bean 的 ModSync 模块名。 */
const BOSS_SYNC_MODULE = "gameDemoBossRoom";

export function createPluginModule(): PluginModule {
  return {
    install(context) {
      const rpc = context.ports.lobbyRpc;
      context.own(
        setGameDemoRuntime({
          assets: () => rpc.query(GameDemoRpc.Assets, {}),
          initialize: () => rpc.sendIdempotent(GameDemoRpc.Initialize, {}),
          shop: () => rpc.query(GameDemoRpc.Shop, {}),
          buy: (product, count) => rpc.sendIdempotent(GameDemoRpc.Buy, { product, count }),
          mails: () => rpc.query(GameDemoRpc.MailList, {}),
          readMail: (mailId) => rpc.query(GameDemoRpc.MailRead, { mailId }),
          claimMail: (mailId) => rpc.sendIdempotent(GameDemoRpc.MailClaim, { mailId }),
          hero: () => rpc.query(GameDemoRpc.HeroGet, {}),
          upgrade: (pill, count) => rpc.sendIdempotent(GameDemoRpc.HeroUpgrade, { pill, count }),
          alchemy: () => rpc.query(GameDemoRpc.AlchemyGet, {}),
          startAlchemy: (count) => rpc.sendIdempotent(GameDemoRpc.AlchemyStart, { count }),
          season: () => rpc.query(GameDemoRpc.SeasonGet, {}),
          endSeason: (number) => rpc.sendIdempotent(GameDemoRpc.SeasonEnd, { number }),
          guild: () => rpc.query(GameDemoRpc.GuildGet, {}),
          createGuild: (name) => rpc.sendIdempotent(GameDemoRpc.GuildCreate, { name }),
          inviteGuild: (targetUid) => rpc.sendIdempotent(GameDemoRpc.GuildInvite, { targetUid }),
          respondGuild: (inviteId, accept) =>
            rpc.sendIdempotent(GameDemoRpc.GuildRespond, { inviteId, accept }),
          leaveGuild: () => rpc.sendIdempotent(GameDemoRpc.GuildLeave, {}),
          bosses: () => rpc.query(GameDemoRpc.BossList, {}),
          boss: (bossId) => rpc.query(GameDemoRpc.BossGet, { bossId }),
          enterBoss: (bossId) => rpc.sendIdempotent(GameDemoRpc.BossEnter, { bossId }),
          leaveBoss: (bossId, generation) =>
            rpc.sendIdempotent(GameDemoRpc.BossLeave, { bossId, generation }),
          attackBoss: (bossId, runNumber, generation, autoAttack) =>
            rpc.sendIdempotent(GameDemoRpc.BossAttack, {
              bossId,
              runNumber,
              generation,
              ...(autoAttack === undefined ? {} : { autoAttack }),
            }),
          onBossSync: (callback, signal) => {
            if (signal.aborted) return () => {};
            const off = lobbyDataSync.subscribeModule(BOSS_SYNC_MODULE, (value) => {
              const revision =
                value && typeof value === "object" && !Array.isArray(value) ? value.revision : undefined;
              if (!signal.aborted && typeof revision === "number") callback(revision);
            });
            signal.addEventListener("abort", off, { once: true });
            return off;
          },
          now: () => context.ports.clock.now(),
          onTick: (callback, signal) => context.ports.ticker.add(callback, signal),
          close: () => context.ports.launch.launch({ kind: "route", routeId: "settings" }),
        }),
      );
    },
  };
}
