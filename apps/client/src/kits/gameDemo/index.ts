import { listGameDemoBoss, fetchGameDemoBoss, enterGameDemoBoss, leaveGameDemoBoss, attackGameDemoBoss } from './api/boss/index';
import { GameDemoBossPush } from '../../shared/native/lobbyRpc/domains/gameDemoBoss';
import { fetchGameDemoGuild, createGameDemoGuild, inviteGameDemoGuild, respondGameDemoGuild, leaveGameDemoGuild } from './api/guild/index';
import { fetchGameDemoSeason, endGameDemoSeason } from './api/season/index';
import type { PluginModule } from "../../app/PluginHost";
import { fetchGameDemoStatus, fetchGameDemoAssets, initializeGameDemo, fetchGameDemoShop, buyGameDemoMaterial, fetchGameDemoMail, readGameDemoMail, claimGameDemoMail } from "./api/growth/index";
import { setGameDemoRuntime } from "./logic/gameDemoRuntime";
import { fetchGameDemoHero, upgradeGameDemoHero } from './api/growth/index';
import { fetchGameDemoAlchemy, startGameDemoAlchemy, finishGameDemoAlchemy } from './api/production/index';

export function createPluginModule(): PluginModule {
    return {
        install(context) {
            const rpc=context.ports.nativeLobbyRpc;
            if(!rpc) throw new Error("gameDemo requires native kit RPC capability");
            context.own(setGameDemoRuntime({
                status: () => fetchGameDemoStatus(rpc),
                assets: () => fetchGameDemoAssets(rpc),
                initialize: () => initializeGameDemo(rpc),
                shop: () => fetchGameDemoShop(rpc),
                buy: (product, count) => buyGameDemoMaterial(rpc, product, count),
                mails: () => fetchGameDemoMail(rpc),
                readMail: mailId => readGameDemoMail(rpc, mailId),
                claimMail: mailId => claimGameDemoMail(rpc, mailId),
                hero: () => fetchGameDemoHero(rpc),
                upgrade: (pill, count) => upgradeGameDemoHero(rpc, pill, count),
                alchemy: () => fetchGameDemoAlchemy(rpc),
                startAlchemy: count => startGameDemoAlchemy(rpc, count),
                finishAlchemy: (batchId, early) => finishGameDemoAlchemy(rpc, batchId, early),
                season: () => fetchGameDemoSeason(rpc),
                endSeason: seasonId => endGameDemoSeason(rpc, seasonId),
                guild: () => fetchGameDemoGuild(rpc),
                createGuild: name => createGameDemoGuild(rpc, name),
                inviteGuild: targetUid => inviteGameDemoGuild(rpc, targetUid),
                respondGuild: (inviteId, accept) => respondGameDemoGuild(rpc, inviteId, accept),
                leaveGuild: () => leaveGameDemoGuild(rpc),
                bosses: () => listGameDemoBoss(rpc),
                boss: bossId => fetchGameDemoBoss(rpc, bossId),
                enterBoss: bossId => enterGameDemoBoss(rpc, bossId),
                leaveBoss: (bossId, generation) => leaveGameDemoBoss(rpc, bossId, generation),
                attackBoss: (bossId, runId, generation, autoAttack) => attackGameDemoBoss(rpc, bossId, runId, generation, autoAttack),
                onBossChanged: (callback, signal) => {
                    if (!rpc.onPush) throw new Error('gameDemo requires the host typed Lobby push port');
                    if (signal.aborted) return () => {};
                    const off = rpc.onPush(GameDemoBossPush.Changed, event => { if (!signal.aborted) callback(event); });
                    signal.addEventListener('abort', off, { once: true });
                    return off;
                },
                now: () => context.ports.clock.now(),
                onTick: (callback, signal) => context.ports.ticker.add(callback, signal),
                close: () => context.ports.launch.launch({ kind: "route", routeId: "settings" }),
            }));
        },
    };
}
