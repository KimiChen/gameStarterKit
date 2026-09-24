/** gameDemo 域测试向量（serverNew gameDemo 玩法验证样例的 codegen 契约 sidecar）。 */
import { GameDemoRpc } from "@game/shared/protocol/lobbyRpc/domains/gameDemo";
import type { LobbyRpcVectorFile } from "./vectorTypes";

const assets = {
  initialized: true,
  gold: 4700,
  items: { herb: 20, dew: 10, pill: 100, finePill: 100 },
};
const mailbox = {
  mails: [
    {
      id: 1,
      title: "玩法验证奖励",
      gold: 100,
      createdAt: 1_790_000_000_000,
      read: true,
      claimed: true,
    },
  ],
};
const hero = { level: 6, exp: 0, attack: 35 };
const season = {
  number: 1,
  phase: "running" as const,
  startedAt: 1_790_000_000_000,
  endsAt: 1_790_000_600_000,
  serverNow: 1_790_000_060_000,
  top: [{ uid: 1001, score: 9, rank: 1 }],
  myScore: 9,
  myRank: 1,
  rewardedCount: 0,
};
const guild = {
  uid: 1001,
  guild: { id: 1, name: "青云", owner: 1001, members: [1001, 1002] },
  invitations: [],
};
const room = {
  bossId: "tiger" as const,
  name: "山君",
  runNumber: 1,
  hp: 1965,
  maxHp: 2000,
  phase: "running" as const,
  revision: 3,
  respawnAt: 0,
  nextCounterAt: 0,
  damage: [{ uid: 1001, damage: 35, rank: 1 }],
  fighters: [
    {
      uid: 1001,
      active: true,
      hp: 150,
      maxHp: 150,
      autoAttack: false,
      nextAttackAt: 1_790_000_061_000,
      reviveAt: 0,
    },
  ],
  events: [
    {
      sequence: 1,
      at: 1_790_000_060_000,
      uid: 1001,
      kind: "sword" as const,
      amount: 35,
    },
  ],
};
const bossState = {
  uid: 1001,
  room,
  currentBossId: "tiger" as const,
  generation: 1,
  serverNow: 1_790_000_060_000,
  nextAttackAt: 1_790_000_061_000,
  heroAttack: 35,
  myDamage: 35,
  appliedDamage: 35,
};

export default {
  [GameDemoRpc.Assets]: { request: {}, response: assets },
  [GameDemoRpc.Initialize]: { request: { clientReqId: "c1" }, response: assets },
  [GameDemoRpc.Shop]: {
    request: {},
    response: { assets, day: "2026-09-24", purchased: { herb: 20, dew: 10 } },
  },
  [GameDemoRpc.Buy]: {
    request: { clientReqId: "c2", product: "herb", count: 20 },
    response: assets,
  },
  [GameDemoRpc.MailList]: { request: {}, response: mailbox },
  [GameDemoRpc.MailRead]: { request: { mailId: 1 }, response: mailbox },
  [GameDemoRpc.MailClaim]: {
    request: { clientReqId: "c3", mailId: 1 },
    response: { assets, mailbox },
  },
  [GameDemoRpc.HeroGet]: { request: {}, response: { assets, hero } },
  [GameDemoRpc.HeroUpgrade]: {
    request: { clientReqId: "c4", pill: "normal", count: 10 },
    response: { assets, hero, consumed: 10 },
  },
  [GameDemoRpc.AlchemyGet]: { request: {}, response: { assets, batch: null } },
  [GameDemoRpc.AlchemyStart]: {
    request: { clientReqId: "c5", count: 5 },
    response: {
      assets,
      batch: { id: 1, count: 5, startedAt: 1_790_000_060_000, pill: 3, finePill: 2, score: 9 },
    },
  },
  [GameDemoRpc.SeasonGet]: { request: {}, response: season },
  [GameDemoRpc.SeasonEnd]: {
    request: { clientReqId: "c6", number: 1 },
    response: { ...season, phase: "settling" as const },
  },
  [GameDemoRpc.GuildGet]: { request: {}, response: guild },
  [GameDemoRpc.GuildCreate]: { request: { clientReqId: "c7", name: "青云" }, response: guild },
  [GameDemoRpc.GuildInvite]: { request: { clientReqId: "c8", targetUid: 1002 }, response: guild },
  [GameDemoRpc.GuildRespond]: {
    request: { clientReqId: "c9", inviteId: 1, accept: true },
    response: { ...guild, uid: 1002 },
  },
  [GameDemoRpc.GuildLeave]: {
    request: { clientReqId: "c10" },
    response: { uid: 1001, guild: null, invitations: [] },
  },
  [GameDemoRpc.BossList]: {
    request: {},
    response: { rooms: [room], currentBossId: "tiger", generation: 1 },
  },
  [GameDemoRpc.BossGet]: { request: { bossId: "tiger" }, response: { ...bossState, appliedDamage: 0 } },
  [GameDemoRpc.BossEnter]: {
    request: { clientReqId: "c11", bossId: "tiger" },
    response: { ...bossState, appliedDamage: 0 },
  },
  [GameDemoRpc.BossLeave]: {
    request: { clientReqId: "c12", bossId: "tiger", generation: 1 },
    response: { rooms: [room], currentBossId: null, generation: 2 },
  },
  [GameDemoRpc.BossAttack]: {
    request: { clientReqId: "c13", bossId: "tiger", runNumber: 1, generation: 1 },
    response: bossState,
  },
} satisfies LobbyRpcVectorFile;
