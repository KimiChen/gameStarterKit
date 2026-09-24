export interface SoldierCasualties {
    readonly dead: number;
    readonly severelyWounded: number;
    readonly lightlyWounded: number;
    readonly kills: number;
    readonly remaining: number;
}
export interface SoldierDetailEntry {
    readonly id: string;
    readonly count: number;
    readonly tier: number;
    readonly stats: SoldierCasualties;
}
export interface SoldierDetailGroup {
    readonly id: string;
    readonly playerName: string;
    readonly side: 'own' | 'enemy';
    readonly stats: SoldierCasualties;
    readonly soldiers: readonly SoldierDetailEntry[];
    readonly initiallyExpanded?: boolean;
}
export interface SoldierDetailItem {
    readonly id: string;
    readonly groupId: string;
    readonly playerName: string;
    readonly side: 'own' | 'enemy';
    readonly stats: SoldierCasualties;
    readonly count: number;
    readonly tier: number;
    readonly header: boolean;
    readonly expanded: boolean;
    readonly expandable: boolean;
    readonly height: number;
}
