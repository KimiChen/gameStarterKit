import { assertExactKeys, finiteInteger, type RuntimeValidator, WireValidationError } from '../../../protocol/http';
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite } from '../../../protocol/lobbyRpc/defineDomain';
import { emptyPayload, requiredId, rpcRecord } from '../../../protocol/lobbyRpc/primitives';
import { validateGameDemoAssetsRes } from './gameDemo';
import { GAME_DEMO_CONFIG, gameDemoAttack } from '../../../kits/gameDemo/config';
import type { GameDemoHero, GameDemoHeroState, GameDemoUpgradeResult } from '../../../kits/gameDemo/api/growth/index';

export const GameDemoHeroRpc = { Get: 'gameDemoHero.get', Upgrade: 'gameDemoHero.upgrade' } as const;
export interface IGameDemoHeroGetReq { readonly [key: string]: never; }
export interface IGameDemoHeroUpgradeReq { clientReqId: string; pill: 'normal' | 'fine'; count: 1 | 10; }
export type IGameDemoHeroRes = GameDemoHeroState;
export type IGameDemoUpgradeRes = GameDemoUpgradeResult;
export const validateGameDemoHeroGetReq: RuntimeValidator<IGameDemoHeroGetReq> = input => emptyPayload(input);
export const validateGameDemoHeroUpgradeReq: RuntimeValidator<IGameDemoHeroUpgradeReq> = input => {
    const value = rpcRecord(input);
    assertExactKeys(value, ['clientReqId', 'pill', 'count'], [], 'payload');
    if ((value.pill !== 'normal' && value.pill !== 'fine') || (value.count !== 1 && value.count !== 10))
        throw new WireValidationError('GAME_DEMO_UPGRADE', 'payload');
    return { clientReqId: requiredId(value, 'clientReqId'), pill: value.pill, count: value.count };
};
export function validateGameDemoHero(input: unknown): GameDemoHero {
    const value = rpcRecord(input, 'hero');
    assertExactKeys(value, ['level', 'exp', 'attack', 'revision'], [], 'hero');
    const level = finiteInteger(value.level, 'hero.level', 1, GAME_DEMO_CONFIG.heroMaxLevel);
    const exp = finiteInteger(value.exp, 'hero.exp', 0, GAME_DEMO_CONFIG.heroExpPerLevel - 1);
    const attack = finiteInteger(value.attack, 'hero.attack', 1);
    if (attack !== gameDemoAttack(level) || (level === GAME_DEMO_CONFIG.heroMaxLevel && exp !== 0))
        throw new WireValidationError('GAME_DEMO_HERO_STATS', 'hero');
    return { level, exp, attack, revision: finiteInteger(value.revision, 'hero.revision', 0) };
}
export const validateGameDemoHeroRes: RuntimeValidator<IGameDemoHeroRes> = input => {
    const value = rpcRecord(input, 'response');
    assertExactKeys(value, ['assets', 'hero'], [], 'response');
    return { assets: validateGameDemoAssetsRes(value.assets), hero: validateGameDemoHero(value.hero) };
};
export const validateGameDemoUpgradeRes: RuntimeValidator<IGameDemoUpgradeRes> = input => {
    const value = rpcRecord(input, 'response');
    assertExactKeys(value, ['assets', 'hero', 'consumed'], [], 'response');
    return { assets: validateGameDemoAssetsRes(value.assets), hero: validateGameDemoHero(value.hero), consumed: finiteInteger(value.consumed, 'response.consumed', 1, 10) };
};
export default defineLobbyRpcDomain({
    domain: 'gameDemoHero', contractVersion: 1, errorCodes: ['GAME_DEMO_HERO_MAX'], pushes: [],
    routes: [
        defineRpcQuery(GameDemoHeroRpc.Get, { request: validateGameDemoHeroGetReq, response: validateGameDemoHeroRes }),
        defineRpcIdempotentWrite(GameDemoHeroRpc.Upgrade, { request: validateGameDemoHeroUpgradeReq, response: validateGameDemoUpgradeRes }),
    ],
});
