import { GameDemoHeroRpc } from '../../../../../shared/src/native/lobbyRpc/domains/gameDemoHero';
import type { LobbyRpcVectorFile } from './types';
const assets = { initialized: true, revision: 1, gold: 5000, items: { herb: 0, dew: 0, pill: 0, finePill: 0 } };
export default {
    [GameDemoHeroRpc.Get]: { request: {}, response: { assets, hero: { level: 1, exp: 0, attack: 10, revision: 0 } } },
    [GameDemoHeroRpc.Upgrade]: { request: { clientReqId: 'upgrade-one', pill: 'normal', count: 1 }, response: { assets, hero: { level: 1, exp: 10, attack: 10, revision: 1 }, consumed: 1 } },
} satisfies LobbyRpcVectorFile;
