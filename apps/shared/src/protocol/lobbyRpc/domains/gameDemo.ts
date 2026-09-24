/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */
/** Source: apps/shared/schema/protocols/C2S/gameDemo.json; validators are generated, complex leaf checks stay in ../checks/. */
import { WireValidationError, assertExactKeys, boundedString, finiteInteger, type RuntimeValidator } from "../../http";
import { boolField, boundedArray, rpcRecord } from "../primitives";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import { validateGameDemoAlchemyCount, validateGameDemoUpgradeCount } from "../checks/gameDemo";

/** gameDemo 域路由名 */
export const GameDemoRpc = {
    Assets: "gameDemo.assets",
    Initialize: "gameDemo.initialize",
    Shop: "gameDemo.shop",
    Buy: "gameDemo.buy",
    MailList: "gameDemo.mailList",
    MailRead: "gameDemo.mailRead",
    MailClaim: "gameDemo.mailClaim",
    HeroGet: "gameDemo.heroGet",
    HeroUpgrade: "gameDemo.heroUpgrade",
    AlchemyGet: "gameDemo.alchemyGet",
    AlchemyStart: "gameDemo.alchemyStart",
    SeasonGet: "gameDemo.seasonGet",
    SeasonEnd: "gameDemo.seasonEnd",
    GuildGet: "gameDemo.guildGet",
    GuildCreate: "gameDemo.guildCreate",
    GuildInvite: "gameDemo.guildInvite",
    GuildRespond: "gameDemo.guildRespond",
    GuildLeave: "gameDemo.guildLeave",
    BossList: "gameDemo.bossList",
    BossGet: "gameDemo.bossGet",
    BossEnter: "gameDemo.bossEnter",
    BossLeave: "gameDemo.bossLeave",
    BossAttack: "gameDemo.bossAttack",
} as const;

export interface IGameDemoEmptyReq {
    readonly [key: string]: never
}

export interface IGameDemoItems {
    herb: number
    dew: number
    pill: number
    finePill: number
}

export interface IGameDemoAssets {
    initialized: boolean
    gold: number
    items: IGameDemoItems
}

export interface IGameDemoWriteReq {
    clientReqId: string
}

export interface IGameDemoShopPurchased {
    herb: number
    dew: number
}

export interface IGameDemoShop {
    assets: IGameDemoAssets
    day: string
    purchased: IGameDemoShopPurchased
}

export interface IGameDemoBuyReq {
    clientReqId: string
    product: "herb" | "dew"
    count: number
}

export interface IGameDemoMail {
    id: number
    title: string
    gold: number
    createdAt: number
    read: boolean
    claimed: boolean
}

export interface IGameDemoMailbox {
    mails: IGameDemoMail[]
}

export interface IGameDemoMailReadReq {
    mailId: number
}

export interface IGameDemoMailClaimReq {
    clientReqId: string
    mailId: number
}

export interface IGameDemoMailClaim {
    assets: IGameDemoAssets
    mailbox: IGameDemoMailbox
}

export interface IGameDemoHero {
    level: number
    exp: number
    attack: number
}

export interface IGameDemoHeroState {
    assets: IGameDemoAssets
    hero: IGameDemoHero
}

export interface IGameDemoHeroUpgradeReq {
    clientReqId: string
    pill: "normal" | "fine"
    count: number
}

export interface IGameDemoHeroUpgrade {
    assets: IGameDemoAssets
    hero: IGameDemoHero
    consumed: number
}

export interface IGameDemoAlchemyBatch {
    id: number
    count: number
    startedAt: number
    pill: number
    finePill: number
    score: number
}

export interface IGameDemoAlchemyState {
    assets: IGameDemoAssets
    batch: IGameDemoAlchemyBatch | null
}

export interface IGameDemoAlchemyStartReq {
    clientReqId: string
    count: number
}

export interface IGameDemoRankEntry {
    uid: number
    score: number
    rank: number
}

export interface IGameDemoSeason {
    number: number
    phase: "running" | "settling" | "settled"
    startedAt: number
    endsAt: number
    serverNow: number
    top: IGameDemoRankEntry[]
    myScore: number
    myRank: number | null
    rewardedCount: number
}

export interface IGameDemoSeasonEndReq {
    clientReqId: string
    number: number
}

export interface IGameDemoGuild {
    id: number
    name: string
    owner: number
    members: number[]
}

export interface IGameDemoGuildInvite {
    id: number
    guildId: number
    guildName: string
    inviter: number
}

export interface IGameDemoGuildState {
    uid: number
    guild: IGameDemoGuild | null
    invitations: IGameDemoGuildInvite[]
}

export interface IGameDemoGuildCreateReq {
    clientReqId: string
    name: string
}

export interface IGameDemoGuildInviteReq {
    clientReqId: string
    targetUid: number
}

export interface IGameDemoGuildRespondReq {
    clientReqId: string
    inviteId: number
    accept: boolean
}

export interface IGameDemoBossDamage {
    uid: number
    damage: number
    rank: number
}

export interface IGameDemoBossFighter {
    uid: number
    active: boolean
    hp: number
    maxHp: number
    autoAttack: boolean
    nextAttackAt: number
    reviveAt: number
}

export interface IGameDemoBossEvent {
    sequence: number
    at: number
    uid: number
    kind: "sword" | "counter" | "revive"
    amount: number
}

export interface IGameDemoBossRoom {
    bossId: "tiger" | "dragon" | "phoenix"
    name: string
    runNumber: number
    hp: number
    maxHp: number
    phase: "running" | "settling" | "settled"
    revision: number
    respawnAt: number
    nextCounterAt: number
    damage: IGameDemoBossDamage[]
    fighters: IGameDemoBossFighter[]
    events: IGameDemoBossEvent[]
}

export interface IGameDemoBossList {
    rooms: IGameDemoBossRoom[]
    currentBossId: "tiger" | "dragon" | "phoenix" | null
    generation: number
}

export interface IGameDemoBossGetReq {
    bossId: "tiger" | "dragon" | "phoenix"
}

export interface IGameDemoBossState {
    uid: number
    room: IGameDemoBossRoom
    currentBossId: "tiger" | "dragon" | "phoenix" | null
    generation: number
    serverNow: number
    nextAttackAt: number
    heroAttack: number
    myDamage: number
    appliedDamage: number
}

export interface IGameDemoBossEnterReq {
    clientReqId: string
    bossId: "tiger" | "dragon" | "phoenix"
}

export interface IGameDemoBossLeaveReq {
    clientReqId: string
    bossId: "tiger" | "dragon" | "phoenix"
    generation: number
}

export interface IGameDemoBossAttackReq {
    clientReqId: string
    bossId: "tiger" | "dragon" | "phoenix"
    runNumber: number
    generation: number
    autoAttack?: boolean
}

function parseIGameDemoEmptyReq(input: unknown, path: string): IGameDemoEmptyReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, [], [], path)
    const out: IGameDemoEmptyReq = {
    }
    return out
}

function parseIGameDemoItems(input: unknown, path: string): IGameDemoItems {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["herb", "dew", "pill", "finePill"], [], path)
    const out: IGameDemoItems = {
        herb: finiteInteger(value.herb, `${path}.herb`, 0, Number.MAX_SAFE_INTEGER),
        dew: finiteInteger(value.dew, `${path}.dew`, 0, Number.MAX_SAFE_INTEGER),
        pill: finiteInteger(value.pill, `${path}.pill`, 0, Number.MAX_SAFE_INTEGER),
        finePill: finiteInteger(value.finePill, `${path}.finePill`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoAssets(input: unknown, path: string): IGameDemoAssets {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["initialized", "gold", "items"], [], path)
    const out: IGameDemoAssets = {
        initialized: boolField(value, "initialized"),
        gold: finiteInteger(value.gold, `${path}.gold`, 0, Number.MAX_SAFE_INTEGER),
        items: parseIGameDemoItems(value.items, `${path}.items`),
    }
    return out
}

function parseIGameDemoWriteReq(input: unknown, path: string): IGameDemoWriteReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId"], [], path)
    const out: IGameDemoWriteReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
    }
    return out
}

function parseIGameDemoShopPurchased(input: unknown, path: string): IGameDemoShopPurchased {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["herb", "dew"], [], path)
    const out: IGameDemoShopPurchased = {
        herb: finiteInteger(value.herb, `${path}.herb`, 0, Number.MAX_SAFE_INTEGER),
        dew: finiteInteger(value.dew, `${path}.dew`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoShop(input: unknown, path: string): IGameDemoShop {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["assets", "day", "purchased"], [], path)
    const out: IGameDemoShop = {
        assets: parseIGameDemoAssets(value.assets, `${path}.assets`),
        day: boundedString(value.day, `${path}.day`, 10, 10),
        purchased: parseIGameDemoShopPurchased(value.purchased, `${path}.purchased`),
    }
    return out
}

function parseIGameDemoBuyReq(input: unknown, path: string): IGameDemoBuyReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "product", "count"], [], path)
    const out: IGameDemoBuyReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        product: ((v) => { if (v !== "herb" && v !== "dew") throw new WireValidationError("GAME_DEMO_PRODUCT", `${path}.product`); return v as "herb" | "dew"; })(value.product),
        count: finiteInteger(value.count, `${path}.count`, 1, 100),
    }
    return out
}

function parseIGameDemoMail(input: unknown, path: string): IGameDemoMail {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["id", "title", "gold", "createdAt", "read", "claimed"], [], path)
    const out: IGameDemoMail = {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        title: boundedString(value.title, `${path}.title`, 1, 80),
        gold: finiteInteger(value.gold, `${path}.gold`, 0, Number.MAX_SAFE_INTEGER),
        createdAt: finiteInteger(value.createdAt, `${path}.createdAt`, 0, Number.MAX_SAFE_INTEGER),
        read: boolField(value, "read"),
        claimed: boolField(value, "claimed"),
    }
    return out
}

function parseIGameDemoMailbox(input: unknown, path: string): IGameDemoMailbox {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mails"], [], path)
    const out: IGameDemoMailbox = {
        mails: boundedArray(value.mails, `${path}.mails`, 0, 100, "WIRE_ARRAY").map((item, i) => parseIGameDemoMail(item, `${path}.mails[${i}]`)),
    }
    return out
}

function parseIGameDemoMailReadReq(input: unknown, path: string): IGameDemoMailReadReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["mailId"], [], path)
    const out: IGameDemoMailReadReq = {
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoMailClaimReq(input: unknown, path: string): IGameDemoMailClaimReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "mailId"], [], path)
    const out: IGameDemoMailClaimReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        mailId: finiteInteger(value.mailId, `${path}.mailId`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoMailClaim(input: unknown, path: string): IGameDemoMailClaim {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["assets", "mailbox"], [], path)
    const out: IGameDemoMailClaim = {
        assets: parseIGameDemoAssets(value.assets, `${path}.assets`),
        mailbox: parseIGameDemoMailbox(value.mailbox, `${path}.mailbox`),
    }
    return out
}

function parseIGameDemoHero(input: unknown, path: string): IGameDemoHero {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["level", "exp", "attack"], [], path)
    const out: IGameDemoHero = {
        level: finiteInteger(value.level, `${path}.level`, 1, 100),
        exp: finiteInteger(value.exp, `${path}.exp`, 0, Number.MAX_SAFE_INTEGER),
        attack: finiteInteger(value.attack, `${path}.attack`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoHeroState(input: unknown, path: string): IGameDemoHeroState {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["assets", "hero"], [], path)
    const out: IGameDemoHeroState = {
        assets: parseIGameDemoAssets(value.assets, `${path}.assets`),
        hero: parseIGameDemoHero(value.hero, `${path}.hero`),
    }
    return out
}

function parseIGameDemoHeroUpgradeReq(input: unknown, path: string): IGameDemoHeroUpgradeReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "pill", "count"], [], path)
    const out: IGameDemoHeroUpgradeReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        pill: ((v) => { if (v !== "normal" && v !== "fine") throw new WireValidationError("GAME_DEMO_PILL", `${path}.pill`); return v as "normal" | "fine"; })(value.pill),
        count: validateGameDemoUpgradeCount(value.count, `${path}.count`),
    }
    return out
}

function parseIGameDemoHeroUpgrade(input: unknown, path: string): IGameDemoHeroUpgrade {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["assets", "hero", "consumed"], [], path)
    const out: IGameDemoHeroUpgrade = {
        assets: parseIGameDemoAssets(value.assets, `${path}.assets`),
        hero: parseIGameDemoHero(value.hero, `${path}.hero`),
        consumed: finiteInteger(value.consumed, `${path}.consumed`, 1, 10),
    }
    return out
}

function parseIGameDemoAlchemyBatch(input: unknown, path: string): IGameDemoAlchemyBatch {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["id", "count", "startedAt", "pill", "finePill", "score"], [], path)
    const out: IGameDemoAlchemyBatch = {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        count: finiteInteger(value.count, `${path}.count`, 1, Number.MAX_SAFE_INTEGER),
        startedAt: finiteInteger(value.startedAt, `${path}.startedAt`, 0, Number.MAX_SAFE_INTEGER),
        pill: finiteInteger(value.pill, `${path}.pill`, 0, Number.MAX_SAFE_INTEGER),
        finePill: finiteInteger(value.finePill, `${path}.finePill`, 0, Number.MAX_SAFE_INTEGER),
        score: finiteInteger(value.score, `${path}.score`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoAlchemyState(input: unknown, path: string): IGameDemoAlchemyState {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["assets", "batch"], [], path)
    const out: IGameDemoAlchemyState = {
        assets: parseIGameDemoAssets(value.assets, `${path}.assets`),
        batch: ((v) => (v === null ? null : parseIGameDemoAlchemyBatch(v, `${path}.batch`)))(value.batch),
    }
    return out
}

function parseIGameDemoAlchemyStartReq(input: unknown, path: string): IGameDemoAlchemyStartReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "count"], [], path)
    const out: IGameDemoAlchemyStartReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        count: validateGameDemoAlchemyCount(value.count, `${path}.count`),
    }
    return out
}

function parseIGameDemoRankEntry(input: unknown, path: string): IGameDemoRankEntry {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "score", "rank"], [], path)
    const out: IGameDemoRankEntry = {
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        score: finiteInteger(value.score, `${path}.score`, 1, Number.MAX_SAFE_INTEGER),
        rank: finiteInteger(value.rank, `${path}.rank`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoSeason(input: unknown, path: string): IGameDemoSeason {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["number", "phase", "startedAt", "endsAt", "serverNow", "top", "myScore", "myRank", "rewardedCount"], [], path)
    const out: IGameDemoSeason = {
        number: finiteInteger(value.number, `${path}.number`, 1, Number.MAX_SAFE_INTEGER),
        phase: ((v) => { if (v !== "running" && v !== "settling" && v !== "settled") throw new WireValidationError("GAME_DEMO_PHASE", `${path}.phase`); return v as "running" | "settling" | "settled"; })(value.phase),
        startedAt: finiteInteger(value.startedAt, `${path}.startedAt`, 0, Number.MAX_SAFE_INTEGER),
        endsAt: finiteInteger(value.endsAt, `${path}.endsAt`, 0, Number.MAX_SAFE_INTEGER),
        serverNow: finiteInteger(value.serverNow, `${path}.serverNow`, 0, Number.MAX_SAFE_INTEGER),
        top: boundedArray(value.top, `${path}.top`, 0, 20, "WIRE_ARRAY").map((item, i) => parseIGameDemoRankEntry(item, `${path}.top[${i}]`)),
        myScore: finiteInteger(value.myScore, `${path}.myScore`, 0, Number.MAX_SAFE_INTEGER),
        myRank: ((v) => (v === null ? null : finiteInteger(v, `${path}.myRank`, 1, Number.MAX_SAFE_INTEGER)))(value.myRank),
        rewardedCount: finiteInteger(value.rewardedCount, `${path}.rewardedCount`, 0, 3),
    }
    return out
}

function parseIGameDemoSeasonEndReq(input: unknown, path: string): IGameDemoSeasonEndReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "number"], [], path)
    const out: IGameDemoSeasonEndReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        number: finiteInteger(value.number, `${path}.number`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoGuild(input: unknown, path: string): IGameDemoGuild {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["id", "name", "owner", "members"], [], path)
    const out: IGameDemoGuild = {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        name: boundedString(value.name, `${path}.name`, 1, 16),
        owner: finiteInteger(value.owner, `${path}.owner`, 1, Number.MAX_SAFE_INTEGER),
        members: boundedArray(value.members, `${path}.members`, 0, 3, "WIRE_ARRAY").map((item, i) => finiteInteger(item, `${path}.members[${i}]`, 1, Number.MAX_SAFE_INTEGER)),
    }
    return out
}

function parseIGameDemoGuildInvite(input: unknown, path: string): IGameDemoGuildInvite {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["id", "guildId", "guildName", "inviter"], [], path)
    const out: IGameDemoGuildInvite = {
        id: finiteInteger(value.id, `${path}.id`, 1, Number.MAX_SAFE_INTEGER),
        guildId: finiteInteger(value.guildId, `${path}.guildId`, 1, Number.MAX_SAFE_INTEGER),
        guildName: boundedString(value.guildName, `${path}.guildName`, 1, 16),
        inviter: finiteInteger(value.inviter, `${path}.inviter`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoGuildState(input: unknown, path: string): IGameDemoGuildState {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "guild", "invitations"], [], path)
    const out: IGameDemoGuildState = {
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        guild: ((v) => (v === null ? null : parseIGameDemoGuild(v, `${path}.guild`)))(value.guild),
        invitations: boundedArray(value.invitations, `${path}.invitations`, 0, 20, "WIRE_ARRAY").map((item, i) => parseIGameDemoGuildInvite(item, `${path}.invitations[${i}]`)),
    }
    return out
}

function parseIGameDemoGuildCreateReq(input: unknown, path: string): IGameDemoGuildCreateReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "name"], [], path)
    const out: IGameDemoGuildCreateReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        name: ((v) => { const parsed = boundedString(v, `${path}.name`, 1, 16); if (!/\S/u.test(parsed)) throw new WireValidationError("GAME_DEMO_GUILD_NAME", `${path}.name`); return parsed; })(value.name),
    }
    return out
}

function parseIGameDemoGuildInviteReq(input: unknown, path: string): IGameDemoGuildInviteReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "targetUid"], [], path)
    const out: IGameDemoGuildInviteReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        targetUid: finiteInteger(value.targetUid, `${path}.targetUid`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoGuildRespondReq(input: unknown, path: string): IGameDemoGuildRespondReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "inviteId", "accept"], [], path)
    const out: IGameDemoGuildRespondReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        inviteId: finiteInteger(value.inviteId, `${path}.inviteId`, 1, Number.MAX_SAFE_INTEGER),
        accept: boolField(value, "accept"),
    }
    return out
}

function parseIGameDemoBossDamage(input: unknown, path: string): IGameDemoBossDamage {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "damage", "rank"], [], path)
    const out: IGameDemoBossDamage = {
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        damage: finiteInteger(value.damage, `${path}.damage`, 0, Number.MAX_SAFE_INTEGER),
        rank: finiteInteger(value.rank, `${path}.rank`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossFighter(input: unknown, path: string): IGameDemoBossFighter {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "active", "hp", "maxHp", "autoAttack", "nextAttackAt", "reviveAt"], [], path)
    const out: IGameDemoBossFighter = {
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        active: boolField(value, "active"),
        hp: finiteInteger(value.hp, `${path}.hp`, 0, Number.MAX_SAFE_INTEGER),
        maxHp: finiteInteger(value.maxHp, `${path}.maxHp`, 1, Number.MAX_SAFE_INTEGER),
        autoAttack: boolField(value, "autoAttack"),
        nextAttackAt: finiteInteger(value.nextAttackAt, `${path}.nextAttackAt`, 0, Number.MAX_SAFE_INTEGER),
        reviveAt: finiteInteger(value.reviveAt, `${path}.reviveAt`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossEvent(input: unknown, path: string): IGameDemoBossEvent {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["sequence", "at", "uid", "kind", "amount"], [], path)
    const out: IGameDemoBossEvent = {
        sequence: finiteInteger(value.sequence, `${path}.sequence`, 1, Number.MAX_SAFE_INTEGER),
        at: finiteInteger(value.at, `${path}.at`, 0, Number.MAX_SAFE_INTEGER),
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        kind: ((v) => { if (v !== "sword" && v !== "counter" && v !== "revive") throw new WireValidationError("GAME_DEMO_BOSS_EVENT", `${path}.kind`); return v as "sword" | "counter" | "revive"; })(value.kind),
        amount: finiteInteger(value.amount, `${path}.amount`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossRoom(input: unknown, path: string): IGameDemoBossRoom {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["bossId", "name", "runNumber", "hp", "maxHp", "phase", "revision", "respawnAt", "nextCounterAt", "damage", "fighters", "events"], [], path)
    const out: IGameDemoBossRoom = {
        bossId: ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.bossId`); return v as "tiger" | "dragon" | "phoenix"; })(value.bossId),
        name: boundedString(value.name, `${path}.name`, 1, 16),
        runNumber: finiteInteger(value.runNumber, `${path}.runNumber`, 1, Number.MAX_SAFE_INTEGER),
        hp: finiteInteger(value.hp, `${path}.hp`, 0, Number.MAX_SAFE_INTEGER),
        maxHp: finiteInteger(value.maxHp, `${path}.maxHp`, 1, Number.MAX_SAFE_INTEGER),
        phase: ((v) => { if (v !== "running" && v !== "settling" && v !== "settled") throw new WireValidationError("GAME_DEMO_PHASE", `${path}.phase`); return v as "running" | "settling" | "settled"; })(value.phase),
        revision: finiteInteger(value.revision, `${path}.revision`, 0, Number.MAX_SAFE_INTEGER),
        respawnAt: finiteInteger(value.respawnAt, `${path}.respawnAt`, 0, Number.MAX_SAFE_INTEGER),
        nextCounterAt: finiteInteger(value.nextCounterAt, `${path}.nextCounterAt`, 0, Number.MAX_SAFE_INTEGER),
        damage: boundedArray(value.damage, `${path}.damage`, 0, 100, "WIRE_ARRAY").map((item, i) => parseIGameDemoBossDamage(item, `${path}.damage[${i}]`)),
        fighters: boundedArray(value.fighters, `${path}.fighters`, 0, 100, "WIRE_ARRAY").map((item, i) => parseIGameDemoBossFighter(item, `${path}.fighters[${i}]`)),
        events: boundedArray(value.events, `${path}.events`, 0, 64, "WIRE_ARRAY").map((item, i) => parseIGameDemoBossEvent(item, `${path}.events[${i}]`)),
    }
    return out
}

function parseIGameDemoBossList(input: unknown, path: string): IGameDemoBossList {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["rooms", "currentBossId", "generation"], [], path)
    const out: IGameDemoBossList = {
        rooms: boundedArray(value.rooms, `${path}.rooms`, 0, 3, "WIRE_ARRAY").map((item, i) => parseIGameDemoBossRoom(item, `${path}.rooms[${i}]`)),
        currentBossId: ((v) => (v === null ? null : ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.currentBossId`); return v as "tiger" | "dragon" | "phoenix" | null; })(v)))(value.currentBossId),
        generation: finiteInteger(value.generation, `${path}.generation`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossGetReq(input: unknown, path: string): IGameDemoBossGetReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["bossId"], [], path)
    const out: IGameDemoBossGetReq = {
        bossId: ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.bossId`); return v as "tiger" | "dragon" | "phoenix"; })(value.bossId),
    }
    return out
}

function parseIGameDemoBossState(input: unknown, path: string): IGameDemoBossState {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["uid", "room", "currentBossId", "generation", "serverNow", "nextAttackAt", "heroAttack", "myDamage", "appliedDamage"], [], path)
    const out: IGameDemoBossState = {
        uid: finiteInteger(value.uid, `${path}.uid`, 1, Number.MAX_SAFE_INTEGER),
        room: parseIGameDemoBossRoom(value.room, `${path}.room`),
        currentBossId: ((v) => (v === null ? null : ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.currentBossId`); return v as "tiger" | "dragon" | "phoenix" | null; })(v)))(value.currentBossId),
        generation: finiteInteger(value.generation, `${path}.generation`, 0, Number.MAX_SAFE_INTEGER),
        serverNow: finiteInteger(value.serverNow, `${path}.serverNow`, 0, Number.MAX_SAFE_INTEGER),
        nextAttackAt: finiteInteger(value.nextAttackAt, `${path}.nextAttackAt`, 0, Number.MAX_SAFE_INTEGER),
        heroAttack: finiteInteger(value.heroAttack, `${path}.heroAttack`, 1, Number.MAX_SAFE_INTEGER),
        myDamage: finiteInteger(value.myDamage, `${path}.myDamage`, 0, Number.MAX_SAFE_INTEGER),
        appliedDamage: finiteInteger(value.appliedDamage, `${path}.appliedDamage`, 0, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossEnterReq(input: unknown, path: string): IGameDemoBossEnterReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "bossId"], [], path)
    const out: IGameDemoBossEnterReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        bossId: ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.bossId`); return v as "tiger" | "dragon" | "phoenix"; })(value.bossId),
    }
    return out
}

function parseIGameDemoBossLeaveReq(input: unknown, path: string): IGameDemoBossLeaveReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "bossId", "generation"], [], path)
    const out: IGameDemoBossLeaveReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        bossId: ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.bossId`); return v as "tiger" | "dragon" | "phoenix"; })(value.bossId),
        generation: finiteInteger(value.generation, `${path}.generation`, 1, Number.MAX_SAFE_INTEGER),
    }
    return out
}

function parseIGameDemoBossAttackReq(input: unknown, path: string): IGameDemoBossAttackReq {
    const value = rpcRecord(input, path)
    assertExactKeys(value, ["clientReqId", "bossId", "runNumber", "generation"], ["autoAttack"], path)
    const out: IGameDemoBossAttackReq = {
        clientReqId: boundedString(value.clientReqId, `${path}.clientReqId`, 1, 64),
        bossId: ((v) => { if (v !== "tiger" && v !== "dragon" && v !== "phoenix") throw new WireValidationError("GAME_DEMO_BOSS_ID", `${path}.bossId`); return v as "tiger" | "dragon" | "phoenix"; })(value.bossId),
        runNumber: finiteInteger(value.runNumber, `${path}.runNumber`, 1, Number.MAX_SAFE_INTEGER),
        generation: finiteInteger(value.generation, `${path}.generation`, 1, Number.MAX_SAFE_INTEGER),
    }
    if (value.autoAttack !== undefined) out.autoAttack = boolField(value, "autoAttack")
    return out
}

export const validateGameDemoAssetsReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoAssetsRes: RuntimeValidator<IGameDemoAssets> = (input) => parseIGameDemoAssets(input, "response")

export const validateGameDemoInitializeReq: RuntimeValidator<IGameDemoWriteReq> = (input) => parseIGameDemoWriteReq(input, "payload")

export const validateGameDemoInitializeRes: RuntimeValidator<IGameDemoAssets> = (input) => parseIGameDemoAssets(input, "response")

export const validateGameDemoShopReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoShopRes: RuntimeValidator<IGameDemoShop> = (input) => parseIGameDemoShop(input, "response")

export const validateGameDemoBuyReq: RuntimeValidator<IGameDemoBuyReq> = (input) => parseIGameDemoBuyReq(input, "payload")

export const validateGameDemoBuyRes: RuntimeValidator<IGameDemoAssets> = (input) => parseIGameDemoAssets(input, "response")

export const validateGameDemoMailListReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoMailListRes: RuntimeValidator<IGameDemoMailbox> = (input) => parseIGameDemoMailbox(input, "response")

export const validateGameDemoMailReadReq: RuntimeValidator<IGameDemoMailReadReq> = (input) => parseIGameDemoMailReadReq(input, "payload")

export const validateGameDemoMailReadRes: RuntimeValidator<IGameDemoMailbox> = (input) => parseIGameDemoMailbox(input, "response")

export const validateGameDemoMailClaimReq: RuntimeValidator<IGameDemoMailClaimReq> = (input) => parseIGameDemoMailClaimReq(input, "payload")

export const validateGameDemoMailClaimRes: RuntimeValidator<IGameDemoMailClaim> = (input) => parseIGameDemoMailClaim(input, "response")

export const validateGameDemoHeroGetReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoHeroGetRes: RuntimeValidator<IGameDemoHeroState> = (input) => parseIGameDemoHeroState(input, "response")

export const validateGameDemoHeroUpgradeReq: RuntimeValidator<IGameDemoHeroUpgradeReq> = (input) => parseIGameDemoHeroUpgradeReq(input, "payload")

export const validateGameDemoHeroUpgradeRes: RuntimeValidator<IGameDemoHeroUpgrade> = (input) => parseIGameDemoHeroUpgrade(input, "response")

export const validateGameDemoAlchemyGetReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoAlchemyGetRes: RuntimeValidator<IGameDemoAlchemyState> = (input) => parseIGameDemoAlchemyState(input, "response")

export const validateGameDemoAlchemyStartReq: RuntimeValidator<IGameDemoAlchemyStartReq> = (input) => parseIGameDemoAlchemyStartReq(input, "payload")

export const validateGameDemoAlchemyStartRes: RuntimeValidator<IGameDemoAlchemyState> = (input) => parseIGameDemoAlchemyState(input, "response")

export const validateGameDemoSeasonGetReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoSeasonGetRes: RuntimeValidator<IGameDemoSeason> = (input) => parseIGameDemoSeason(input, "response")

export const validateGameDemoSeasonEndReq: RuntimeValidator<IGameDemoSeasonEndReq> = (input) => parseIGameDemoSeasonEndReq(input, "payload")

export const validateGameDemoSeasonEndRes: RuntimeValidator<IGameDemoSeason> = (input) => parseIGameDemoSeason(input, "response")

export const validateGameDemoGuildGetReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoGuildGetRes: RuntimeValidator<IGameDemoGuildState> = (input) => parseIGameDemoGuildState(input, "response")

export const validateGameDemoGuildCreateReq: RuntimeValidator<IGameDemoGuildCreateReq> = (input) => parseIGameDemoGuildCreateReq(input, "payload")

export const validateGameDemoGuildCreateRes: RuntimeValidator<IGameDemoGuildState> = (input) => parseIGameDemoGuildState(input, "response")

export const validateGameDemoGuildInviteReq: RuntimeValidator<IGameDemoGuildInviteReq> = (input) => parseIGameDemoGuildInviteReq(input, "payload")

export const validateGameDemoGuildInviteRes: RuntimeValidator<IGameDemoGuildState> = (input) => parseIGameDemoGuildState(input, "response")

export const validateGameDemoGuildRespondReq: RuntimeValidator<IGameDemoGuildRespondReq> = (input) => parseIGameDemoGuildRespondReq(input, "payload")

export const validateGameDemoGuildRespondRes: RuntimeValidator<IGameDemoGuildState> = (input) => parseIGameDemoGuildState(input, "response")

export const validateGameDemoGuildLeaveReq: RuntimeValidator<IGameDemoWriteReq> = (input) => parseIGameDemoWriteReq(input, "payload")

export const validateGameDemoGuildLeaveRes: RuntimeValidator<IGameDemoGuildState> = (input) => parseIGameDemoGuildState(input, "response")

export const validateGameDemoBossListReq: RuntimeValidator<IGameDemoEmptyReq> = (input) => parseIGameDemoEmptyReq(input, "payload")

export const validateGameDemoBossListRes: RuntimeValidator<IGameDemoBossList> = (input) => parseIGameDemoBossList(input, "response")

export const validateGameDemoBossGetReq: RuntimeValidator<IGameDemoBossGetReq> = (input) => parseIGameDemoBossGetReq(input, "payload")

export const validateGameDemoBossGetRes: RuntimeValidator<IGameDemoBossState> = (input) => parseIGameDemoBossState(input, "response")

export const validateGameDemoBossEnterReq: RuntimeValidator<IGameDemoBossEnterReq> = (input) => parseIGameDemoBossEnterReq(input, "payload")

export const validateGameDemoBossEnterRes: RuntimeValidator<IGameDemoBossState> = (input) => parseIGameDemoBossState(input, "response")

export const validateGameDemoBossLeaveReq: RuntimeValidator<IGameDemoBossLeaveReq> = (input) => parseIGameDemoBossLeaveReq(input, "payload")

export const validateGameDemoBossLeaveRes: RuntimeValidator<IGameDemoBossList> = (input) => parseIGameDemoBossList(input, "response")

export const validateGameDemoBossAttackReq: RuntimeValidator<IGameDemoBossAttackReq> = (input) => parseIGameDemoBossAttackReq(input, "payload")

export const validateGameDemoBossAttackRes: RuntimeValidator<IGameDemoBossState> = (input) => parseIGameDemoBossState(input, "response")

export default defineLobbyRpcDomain({
    domain: "gameDemo",
    contractVersion: 1,
    errorCodes: ["GAME_DEMO_USER_UNAVAILABLE","GAME_DEMO_SEASON_PENDING","GAME_DEMO_DEV_DISABLED","GAME_DEMO_NOT_INITIALIZED","GAME_DEMO_LIMIT","GAME_DEMO_INSUFFICIENT_GOLD","GAME_DEMO_INSUFFICIENT_ITEMS","GAME_DEMO_MAIL_NOT_FOUND","GAME_DEMO_MAILBOX_FULL","GAME_DEMO_HERO_MAX","GAME_DEMO_SEASON_CHANGED","GAME_DEMO_GUILD_JOINED","GAME_DEMO_GUILD_OWNER_ONLY","GAME_DEMO_TARGET_NOT_READY","GAME_DEMO_INVITE_FULL","GAME_DEMO_INVITE_INVALID","GAME_DEMO_GUILD_FULL","GAME_DEMO_BOSS_FULL","GAME_DEMO_BOSS_STALE","GAME_DEMO_BOSS_ENDED","GAME_DEMO_BOSS_DEAD","GAME_DEMO_BOSS_COOLDOWN"],
    pushes: [],
    routes: [
        defineRpcQuery(GameDemoRpc.Assets, { request: validateGameDemoAssetsReq, response: validateGameDemoAssetsRes }),
        defineRpcIdempotentWrite(GameDemoRpc.Initialize, { request: validateGameDemoInitializeReq, response: validateGameDemoInitializeRes }),
        defineRpcQuery(GameDemoRpc.Shop, { request: validateGameDemoShopReq, response: validateGameDemoShopRes }),
        defineRpcIdempotentWrite(GameDemoRpc.Buy, { request: validateGameDemoBuyReq, response: validateGameDemoBuyRes }),
        defineRpcQuery(GameDemoRpc.MailList, { request: validateGameDemoMailListReq, response: validateGameDemoMailListRes }),
        defineRpcNaturalWrite(GameDemoRpc.MailRead, { request: validateGameDemoMailReadReq, response: validateGameDemoMailReadRes }),
        defineRpcIdempotentWrite(GameDemoRpc.MailClaim, { request: validateGameDemoMailClaimReq, response: validateGameDemoMailClaimRes }),
        defineRpcQuery(GameDemoRpc.HeroGet, { request: validateGameDemoHeroGetReq, response: validateGameDemoHeroGetRes }),
        defineRpcIdempotentWrite(GameDemoRpc.HeroUpgrade, { request: validateGameDemoHeroUpgradeReq, response: validateGameDemoHeroUpgradeRes }),
        defineRpcQuery(GameDemoRpc.AlchemyGet, { request: validateGameDemoAlchemyGetReq, response: validateGameDemoAlchemyGetRes }),
        defineRpcIdempotentWrite(GameDemoRpc.AlchemyStart, { request: validateGameDemoAlchemyStartReq, response: validateGameDemoAlchemyStartRes }),
        defineRpcQuery(GameDemoRpc.SeasonGet, { request: validateGameDemoSeasonGetReq, response: validateGameDemoSeasonGetRes }),
        defineRpcIdempotentWrite(GameDemoRpc.SeasonEnd, { request: validateGameDemoSeasonEndReq, response: validateGameDemoSeasonEndRes }),
        defineRpcQuery(GameDemoRpc.GuildGet, { request: validateGameDemoGuildGetReq, response: validateGameDemoGuildGetRes }),
        defineRpcIdempotentWrite(GameDemoRpc.GuildCreate, { request: validateGameDemoGuildCreateReq, response: validateGameDemoGuildCreateRes }),
        defineRpcIdempotentWrite(GameDemoRpc.GuildInvite, { request: validateGameDemoGuildInviteReq, response: validateGameDemoGuildInviteRes }),
        defineRpcIdempotentWrite(GameDemoRpc.GuildRespond, { request: validateGameDemoGuildRespondReq, response: validateGameDemoGuildRespondRes }),
        defineRpcIdempotentWrite(GameDemoRpc.GuildLeave, { request: validateGameDemoGuildLeaveReq, response: validateGameDemoGuildLeaveRes }),
        defineRpcQuery(GameDemoRpc.BossList, { request: validateGameDemoBossListReq, response: validateGameDemoBossListRes }),
        defineRpcQuery(GameDemoRpc.BossGet, { request: validateGameDemoBossGetReq, response: validateGameDemoBossGetRes }),
        defineRpcIdempotentWrite(GameDemoRpc.BossEnter, { request: validateGameDemoBossEnterReq, response: validateGameDemoBossEnterRes }),
        defineRpcIdempotentWrite(GameDemoRpc.BossLeave, { request: validateGameDemoBossLeaveReq, response: validateGameDemoBossLeaveRes }),
        defineRpcIdempotentWrite(GameDemoRpc.BossAttack, { request: validateGameDemoBossAttackReq, response: validateGameDemoBossAttackRes }),
    ],
});
