import { GameDemoGuildRpc } from '../../../../../shared/src/native/lobbyRpc/domains/gameDemoGuild';
import type { LobbyRpcVectorFile } from './types';
const result = { uid: 'user', revision: 1, guild: null, invitations: [] };
export default {
    [GameDemoGuildRpc.Get]: { request: {}, response: result },
    [GameDemoGuildRpc.Create]: { request: { clientReqId: 'create', name: '测试仙盟' }, response: result },
    [GameDemoGuildRpc.Invite]: { request: { clientReqId: 'invite', targetUid: 'target' }, response: result },
    [GameDemoGuildRpc.Respond]: { request: { clientReqId: 'respond', inviteId: 'invitation', accept: true }, response: result },
    [GameDemoGuildRpc.Leave]: { request: { clientReqId: 'leave' }, response: result },
} satisfies LobbyRpcVectorFile;
