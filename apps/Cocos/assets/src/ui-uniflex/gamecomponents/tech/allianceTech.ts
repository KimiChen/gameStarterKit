export interface RewardItemData {
    readonly id: string;
    readonly itemId: string;
    readonly count: string;
    readonly left: number;
    readonly top: number;
}

export interface AllianceTechAttr {
    readonly id: number;
    readonly value: number;
}

export interface AllianceTechLevel {
    readonly level: number;
    readonly attrs: readonly AllianceTechAttr[];
}

/** Alliance tech preview config: name, description, effect, and per-level attrs. */
export type AllianceTechIconKind = 'shield' | 'heart' | 'swords' | 'crate';

export interface AllianceTechConf {
    readonly id: number;
    readonly name: string;
    readonly desc: string;
    readonly effectName: string;
    readonly valueDesc: string;
    readonly iconKind: AllianceTechIconKind;
    readonly levels: readonly AllianceTechLevel[];
}

export interface AllianceTechRuntime {
    readonly level: number;
    readonly donate: number;
    readonly donateMax: number;
    readonly timesUsed: number;
    readonly timesLimit: number;
    readonly payGem: string;
    readonly payCoin: string;
}

export interface AllianceTechView {
    readonly title: string;
    readonly name: string;
    readonly desc: string;
    readonly iconKind: AllianceTechIconKind;
    readonly levelText: string;
    readonly currentAttr: string;
    readonly nextAttr: string;
    readonly progressCurrent: number;
    readonly progressMax: number;
    readonly progressText: string;
    readonly rewards: readonly RewardItemData[];
    readonly leftHint: string;
    readonly rightHint: string;
    readonly payGem: string;
    readonly payCoin: string;
}

export const DEFAULT_TECH_ID = 1011;

const REWARD_LEFTS = [58, 284, 495] as const;
const REWARD_TOPS = [549, 552, 551] as const;

/** Preview donate awards (icon + count). Real awards later come from donate config. */
export const ALLIANCE_TECH_DONATE_AWARDS: readonly { readonly itemId: string; readonly count: string }[] = [
    { itemId: 'gem', count: '30000' },
    { itemId: 'leaf', count: '30000' },
    { itemId: 'ticket', count: '30000' },
];

const ALLIANCE_TECH: Readonly<Record<number, AllianceTechConf>> = {
    1011: {
        id: 1011, name: '工具改良I', desc: '提升建筑的建造速度',
        effectName: '工具改良', valueDesc: '建造时间降低:百分比', iconKind: 'shield',
        levels: [
            { level: 1, attrs: [{ id: 2001, value: 40 }] },
            { level: 2, attrs: [{ id: 2001, value: 50 }] },
            { level: 3, attrs: [{ id: 2001, value: 60 }] },
        ],
    },
    1021: {
        id: 1021, name: '病房扩建I', desc: '提升医院的伤兵容量',
        effectName: '病房扩建', valueDesc: '伤兵容量增加:固定值', iconKind: 'heart',
        levels: [
            { level: 1, attrs: [{ id: 3001, value: 540 }] },
            { level: 2, attrs: [{ id: 3001, value: 720 }] },
            { level: 3, attrs: [{ id: 3001, value: 900 }] },
        ],
    },
    1022: {
        id: 1022, name: '兵营扩建I', desc: '提升单次可训练士兵数量',
        effectName: '兵营扩建', valueDesc: '士兵数量增加:固定值', iconKind: 'swords',
        levels: [
            { level: 1, attrs: [{ id: 3003, value: 2 }] },
            { level: 2, attrs: [{ id: 3003, value: 3 }] },
            { level: 3, attrs: [{ id: 3003, value: 4 }] },
        ],
    },
    1031: {
        id: 1031, name: '器材优化I', desc: '提升学院的研究速度',
        effectName: '器材优化', valueDesc: '研究时间降低:百分比', iconKind: 'crate',
        levels: [
            { level: 1, attrs: [{ id: 2002, value: 40 }] },
            { level: 2, attrs: [{ id: 2002, value: 50 }] },
            { level: 3, attrs: [{ id: 2002, value: 60 }] },
        ],
    },
    1041: {
        id: 1041, name: '包扎术I', desc: '提升医院伤兵的治疗速度',
        effectName: '包扎术', valueDesc: '治疗时间降低:百分比', iconKind: 'crate',
        levels: [
            { level: 1, attrs: [{ id: 2004, value: 460 }] },
            { level: 2, attrs: [{ id: 2004, value: 600 }] },
            { level: 3, attrs: [{ id: 2004, value: 750 }] },
        ],
    },
    1042: {
        id: 1042, name: '训练器材I', desc: '提升士兵的训练速度',
        effectName: '训练器材', valueDesc: '训练时间降低:百分比', iconKind: 'crate',
        levels: [
            { level: 1, attrs: [{ id: 2003, value: 220 }] },
            { level: 2, attrs: [{ id: 2003, value: 300 }] },
            { level: 3, attrs: [{ id: 2003, value: 400 }] },
        ],
    },
    1051: {
        id: 1051, name: '指挥艺术I', desc: '提升同一时间内可分头派遣的出征部队数',
        effectName: '指挥艺术', valueDesc: '部队数增加:固定值', iconKind: 'crate',
        levels: [
            { level: 1, attrs: [{ id: 3005, value: 1 }] },
        ],
    },
    1061: {
        id: 1061, name: '工具改良II', desc: '提升建筑的建造速度',
        effectName: '工具改良', valueDesc: '建造时间降低:百分比', iconKind: 'crate',
        levels: [
            { level: 1, attrs: [{ id: 2001, value: 60 }] },
            { level: 2, attrs: [{ id: 2001, value: 60 }] },
            { level: 3, attrs: [{ id: 2001, value: 100 }] },
        ],
    },
};

const PREVIEW_RUNTIME: Readonly<Record<number, AllianceTechRuntime>> = {
    1011: { level: 1, donate: 20, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1021: { level: 1, donate: 10, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1022: { level: 1, donate: 10, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1031: { level: 0, donate: 0, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1041: { level: 0, donate: 0, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1042: { level: 0, donate: 0, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1051: { level: 0, donate: 0, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
    1061: { level: 0, donate: 0, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000' },
};

const FALLBACK_RUNTIME: AllianceTechRuntime = {
    level: 1, donate: 20, donateMax: 100, timesUsed: 3, timesLimit: 50, payGem: '10', payCoin: '1000',
};

export function getAllianceTech(techId: number): AllianceTechConf {
    return ALLIANCE_TECH[techId] ?? ALLIANCE_TECH[DEFAULT_TECH_ID]!;
}

export function allianceTechMaxLevel(tech: AllianceTechConf): number {
    return tech.levels.length > 0 ? tech.levels[tech.levels.length - 1]!.level : 1;
}

export function getPreviewTechRuntime(techId: number): AllianceTechRuntime {
    return PREVIEW_RUNTIME[techId] ?? FALLBACK_RUNTIME;
}

function attrValue(level: AllianceTechLevel | undefined): number {
    if (level == null || level.attrs.length === 0) return 0;
    return level.attrs[0]!.value;
}

function formatAttr(valueDesc: string, value: number): string {
    const isPercent = valueDesc.indexOf('百分比') >= 0;
    const reduce = valueDesc.indexOf('降低') >= 0;
    if (!isPercent) return `${value}`;
    const shown = value / 100;
    return `${reduce ? '-' : ''}${shown}%`;
}

function findLevel(tech: AllianceTechConf, level: number): AllianceTechLevel | undefined {
    let found: AllianceTechLevel | undefined;
    tech.levels.forEach((entry) => {
        if (found == null && entry.level === level) found = entry;
    });
    return found;
}

export function layoutRewardItems(
    items: readonly { readonly itemId: string; readonly count: string }[],
): RewardItemData[] {
    return items.map((item, index) => ({
        id: `${item.itemId}-${index}`,
        itemId: item.itemId,
        count: item.count,
        left: REWARD_LEFTS[index] ?? REWARD_LEFTS[REWARD_LEFTS.length - 1]!,
        top: REWARD_TOPS[index] ?? REWARD_TOPS[REWARD_TOPS.length - 1]!,
    }));
}

export const DEFAULT_REWARD_ITEMS: readonly RewardItemData[] = layoutRewardItems(ALLIANCE_TECH_DONATE_AWARDS);

export function resolveAllianceTechView(
    techId: number,
    runtime?: Partial<AllianceTechRuntime> & { readonly rewards?: readonly RewardItemData[] },
): AllianceTechView {
    const tech = getAllianceTech(techId);
    const preview = getPreviewTechRuntime(tech.id);
    const maxLevel = allianceTechMaxLevel(tech);
    const level = runtime?.level ?? preview.level;
    const donate = runtime?.donate ?? preview.donate;
    const donateMax = runtime?.donateMax ?? preview.donateMax;
    const timesUsed = runtime?.timesUsed ?? preview.timesUsed;
    const timesLimit = runtime?.timesLimit ?? preview.timesLimit;
    const current = findLevel(tech, level);
    const next = findLevel(tech, Math.min(maxLevel, level + 1));
    const currentValue = level <= 0 ? 0 : attrValue(current);
    const nextValue = level >= maxLevel ? currentValue : attrValue(next);
    const rewards = runtime?.rewards ?? DEFAULT_REWARD_ITEMS;
    return {
        title: tech.name,
        name: tech.name,
        desc: tech.desc,
        iconKind: tech.iconKind,
        levelText: `${Math.max(0, level)}/${maxLevel}`,
        currentAttr: formatAttr(tech.valueDesc, currentValue),
        nextAttr: formatAttr(tech.valueDesc, nextValue),
        progressCurrent: donate,
        progressMax: donateMax,
        progressText: `${donate}/${donateMax}`,
        rewards,
        leftHint: '没有次数限制',
        rightHint: `次数：${timesUsed}/${timesLimit}`,
        payGem: runtime?.payGem ?? preview.payGem,
        payCoin: runtime?.payCoin ?? preview.payCoin,
    };
}
