import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { HeroSkillSlot } from './HeroSkillSlot';

export interface HeroSkill {
    readonly id: string;
    readonly name: string;
    readonly icon?: import('../../../../kits/uniflex/api/core/index').ImageRef;
    readonly level: string;
    readonly locked: boolean;
    readonly desc: string;
    readonly preview: string;
    readonly hint: string;
}

export interface HeroDetailSkillsProps {
    readonly visible?: boolean;
    readonly skills?: readonly HeroSkill[];
    readonly onSelectSkill?: (id: string) => void;
}

const defaultSkills: readonly HeroSkill[] = [
    { id: 's1', name: '幽灵斩', level: 'Lv.1/5', locked: false, desc: '对目标造成一次物理技能伤害（伤害系数420）', preview: '伤害参数：420/620/810/1010/1200', hint: '' },
    { id: 's2', name: '连斩', level: 'Lv.1/5', locked: false, desc: '对目标连续挥砍，造成物理伤害', preview: '伤害参数：220/340/460/580/700', hint: '' },
    { id: 's3', name: '怒涛', level: 'Lv.1/5', locked: true, desc: '范围冲击，击退周围敌人', preview: '伤害参数：500/700/900/1100/1300', hint: '解锁条件:英雄升至4星' },
    { id: 's4', name: '终焉', level: 'Lv.1/5', locked: true, desc: '对目标造成高额终结伤害', preview: '伤害参数：800/1000/1200/1400/1600', hint: '解锁条件:英雄升至5星' },
];

/** Unselected top-left. Selected moves (-25,-25) for the ring. */
const slots = [
    { left: 38, top: 170 },
    { left: 568, top: 174 },
    { left: 38, top: 461 },
    { left: 568, top: 461 },
] as const;

export const HeroDetailSkills = defineComponent<HeroDetailSkillsProps>((p) => {
    const skills = p.skills ?? defaultSkills;
    const [index, setIndex] = useState(0);
    const skill = skills[index] ?? skills[0];
    const pick = (i: number) => {
        setIndex(i);
        const item = skills[i];
        if (item) p.onSelectSkill?.(item.id);
    };
    return (
        <view name="HeroDetailSkills" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }}>
            <HeroSkillSlot left={slots[0].left} top={slots[0].top} selected={index === 0} icon={skills[0]?.icon}
                locked={skills[0]?.locked} level={skills[0]?.level} onClick={() => pick(0)} />
            <HeroSkillSlot left={slots[1].left} top={slots[1].top} selected={index === 1} icon={skills[1]?.icon}
                locked={skills[1]?.locked} level={skills[1]?.level} onClick={() => pick(1)} />
            <HeroSkillSlot left={slots[2].left} top={slots[2].top} selected={index === 2} icon={skills[2]?.icon}
                locked={skills[2]?.locked} level={skills[2]?.level} onClick={() => pick(2)} />
            <HeroSkillSlot left={slots[3].left} top={slots[3].top} selected={index === 3} icon={skills[3]?.icon}
                locked={skills[3]?.locked} level={skills[3]?.level} onClick={() => pick(3)} />
            <view interaction="press" style={{ position: 'absolute', left: 25, top: 653, width: 58, height: 80 }}>
                <image source={imageRef('ui/hero-detail/arrow')} style={{ width: 58, height: 80 }} />
            </view>
            <view interaction="press" style={{ position: 'absolute', left: 667, top: 653, width: 58, height: 80 }}>
                <image source={imageRef('ui/hero-detail/arrow-right')} style={{ width: 58, height: 80 }} />
            </view>
            <text value={skill ? skill.name : ''}
                style={{ position: 'absolute', left: 63, top: 765, width: 200, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 36, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />
            <text value={skill ? skill.level : ''}
                style={{ position: 'absolute', left: 250, top: 765, width: 180, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 36, color: '#FFE57B', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero-detail/skill-panel')}
                style={{ position: 'absolute', left: 32, top: 828, width: 686, height: 238, sizeMode: 'sliced' }} />
            <text value={skill ? skill.desc : ''}
                style={{ position: 'absolute', left: 59, top: 842, width: 630, height: 70,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: '#ffffff', bold: true }} />
            <text value="升级预览"
                style={{ position: 'absolute', left: 59, top: 931, width: 630, height: 36,
                    font: fontRef('fonts/regular', 700), fontSize: 30, color: '#ffffff', bold: true }} />
            <text value={skill ? skill.preview : ''}
                style={{ position: 'absolute', left: 59, top: 975, width: 630, height: 70,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: '#65EE62', bold: true }} />
            <text visible={skill ? skill.hint !== '' : false} value={skill ? skill.hint : ''}
                style={{ position: 'absolute', left: 80, top: 1123, width: 590, height: 40,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#EF4B4B', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    );
});
