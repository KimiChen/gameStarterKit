export interface TroopBonusValue {
    readonly id: string;
    readonly label: string;
    readonly own: string;
    readonly enemy: string;
}

export interface TroopBonusGroup extends TroopBonusValue {
    readonly initiallyExpanded?: boolean;
    readonly details: readonly TroopBonusValue[];
}

export interface TroopComparisonItem extends TroopBonusValue {
    readonly groupId: string;
    readonly header: boolean;
    readonly expanded: boolean;
    readonly expandable: boolean;
    readonly height: number;
}
