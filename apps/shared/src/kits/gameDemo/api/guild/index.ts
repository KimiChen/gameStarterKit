export interface GameDemoGuild {
    id: string;
    name: string;
    owner: string;
    members: string[];
    revision: number;
}
export interface GameDemoGuildInvite { id: string; guildId: string; guildName: string; inviter: string; }
export interface GameDemoGuildState {
    uid: string;
    revision: number;
    guild: GameDemoGuild | null;
    invitations: GameDemoGuildInvite[];
}
