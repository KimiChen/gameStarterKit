import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from '../../../protocol/http';
import { defineLobbyRpcDomain, defineRpcQuery, defineRpcIdempotentWrite } from '../../../protocol/lobbyRpc/defineDomain';
import { emptyPayload, requiredId, rpcRecord } from '../../../protocol/lobbyRpc/primitives';
import { GAME_DEMO_CONFIG } from '../../../kits/gameDemo/config';
import type { GameDemoGuild, GameDemoGuildInvite, GameDemoGuildState } from '../../../kits/gameDemo/api/guild/index';
export const GameDemoGuildRpc = { Get: 'gameDemoGuild.get', Create: 'gameDemoGuild.create', Invite: 'gameDemoGuild.invite', Respond: 'gameDemoGuild.respond', Leave: 'gameDemoGuild.leave' } as const;
export interface IGameDemoGuildGetReq { readonly [key: string]: never; }
export interface IGameDemoGuildCreateReq { clientReqId: string; name: string; }
export interface IGameDemoGuildInviteReq { clientReqId: string; targetUid: string; }
export interface IGameDemoGuildRespondReq { clientReqId: string; inviteId: string; accept: boolean; }
export interface IGameDemoGuildLeaveReq { clientReqId: string; }
export type IGameDemoGuildRes = GameDemoGuildState;
export const validateGameDemoGuildGetReq: RuntimeValidator<IGameDemoGuildGetReq> = input => emptyPayload(input);
export const validateGameDemoGuildCreateReq: RuntimeValidator<IGameDemoGuildCreateReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'name'], [], 'payload');
    const name = boundedString(v.name, 'payload.name', 1, 16).trim();
    if (!name) throw new WireValidationError('GAME_DEMO_GUILD_NAME', 'payload.name');
    return { clientReqId: requiredId(v, 'clientReqId'), name };
};
export const validateGameDemoGuildInviteReq: RuntimeValidator<IGameDemoGuildInviteReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'targetUid'], [], 'payload');
    return { clientReqId: requiredId(v, 'clientReqId'), targetUid: boundedString(v.targetUid, 'payload.targetUid', 1, 128) };
};
export const validateGameDemoGuildRespondReq: RuntimeValidator<IGameDemoGuildRespondReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId', 'inviteId', 'accept'], [], 'payload');
    if (typeof v.accept !== 'boolean') throw new WireValidationError('GAME_DEMO_INVITE_ACCEPT', 'payload.accept');
    return { clientReqId: requiredId(v, 'clientReqId'), inviteId: boundedString(v.inviteId, 'payload.inviteId', 1, 64), accept: v.accept };
};
export const validateGameDemoGuildLeaveReq: RuntimeValidator<IGameDemoGuildLeaveReq> = input => {
    const v = rpcRecord(input); assertExactKeys(v, ['clientReqId'], [], 'payload');
    return { clientReqId: requiredId(v, 'clientReqId') };
};
export function validateGameDemoGuild(input: unknown): GameDemoGuild {
    const v = rpcRecord(input, 'guild'); assertExactKeys(v, ['id', 'name', 'owner', 'members', 'revision'], [], 'guild');
    if (!Array.isArray(v.members) || v.members.length < 1 || v.members.length > GAME_DEMO_CONFIG.guildCapacity) throw new WireValidationError('GAME_DEMO_GUILD_MEMBERS', 'guild.members');
    const members = v.members.map(uid => boundedString(uid, 'guild.member', 1, 128));
    const owner = boundedString(v.owner, 'guild.owner', 1, 128);
    if (!members.includes(owner) || new Set(members).size !== members.length) throw new WireValidationError('GAME_DEMO_GUILD_OWNER', 'guild.owner');
    return { id: boundedString(v.id, 'guild.id', 1, 64), name: boundedString(v.name, 'guild.name', 1, 16), owner, members, revision: finiteInteger(v.revision, 'guild.revision', 1) };
}
export function validateGameDemoGuildInvite(input: unknown): GameDemoGuildInvite {
    const v = rpcRecord(input, 'invite'); assertExactKeys(v, ['id', 'guildId', 'guildName', 'inviter'], [], 'invite');
    return { id: boundedString(v.id, 'invite.id', 1, 64), guildId: boundedString(v.guildId, 'invite.guildId', 1, 64), guildName: boundedString(v.guildName, 'invite.guildName', 1, 16), inviter: boundedString(v.inviter, 'invite.inviter', 1, 128) };
}
export const validateGameDemoGuildRes: RuntimeValidator<IGameDemoGuildRes> = input => {
    const v = rpcRecord(input, 'response'); assertExactKeys(v, ['uid', 'revision', 'guild', 'invitations'], [], 'response');
    if (!Array.isArray(v.invitations) || v.invitations.length > 20) throw new WireValidationError('GAME_DEMO_GUILD_INVITES', 'response.invitations');
    const invitations = v.invitations.map(validateGameDemoGuildInvite);
    if (new Set(invitations.map(i => i.id)).size !== invitations.length) throw new WireValidationError('GAME_DEMO_GUILD_INVITES', 'response.invitations');
    const uid = boundedString(v.uid, 'response.uid', 1, 128);
    const guild = v.guild === null ? null : validateGameDemoGuild(v.guild);
    if (guild && (!guild.members.includes(uid) || invitations.length)) throw new WireValidationError('GAME_DEMO_GUILD_MEMBERSHIP', 'response.guild');
    return { uid, revision: finiteInteger(v.revision, 'response.revision', 0), guild, invitations };
};
export default defineLobbyRpcDomain({
    domain: 'gameDemoGuild', contractVersion: 1,
    errorCodes: ['GAME_DEMO_GUILD_JOINED', 'GAME_DEMO_GUILD_OWNER_ONLY', 'GAME_DEMO_GUILD_FULL', 'GAME_DEMO_INVITE_INVALID', 'GAME_DEMO_INVITE_FULL', 'GAME_DEMO_TARGET_NOT_READY'], pushes: [],
    routes: [
        defineRpcQuery(GameDemoGuildRpc.Get, { request: validateGameDemoGuildGetReq, response: validateGameDemoGuildRes }),
        defineRpcIdempotentWrite(GameDemoGuildRpc.Create, { request: validateGameDemoGuildCreateReq, response: validateGameDemoGuildRes }),
        defineRpcIdempotentWrite(GameDemoGuildRpc.Invite, { request: validateGameDemoGuildInviteReq, response: validateGameDemoGuildRes }),
        defineRpcIdempotentWrite(GameDemoGuildRpc.Respond, { request: validateGameDemoGuildRespondReq, response: validateGameDemoGuildRes }),
        defineRpcIdempotentWrite(GameDemoGuildRpc.Leave, { request: validateGameDemoGuildLeaveReq, response: validateGameDemoGuildRes }),
    ],
});
