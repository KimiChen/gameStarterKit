import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export type StrengthenWayId = 'skill' | 'train' | 'forge' | 'recruit';

export interface StrengthenWayProps {
    readonly left: number;
    readonly top: number;
    readonly wayId: StrengthenWayId;
    readonly onClick?: () => void;
}

const LABEL_FONT = fontRef('fonts/regular', 700);
const CIRCLE = imageRef('ui/defeat/way-circle');
const ICON_SKILL = imageRef('ui/defeat/icon-skill');
const ICON_TRAIN = imageRef('ui/defeat/icon-train');
const ICON_FORGE = imageRef('ui/defeat/icon-forge');
const ICON_RECRUIT = imageRef('ui/defeat/icon-recruit');

/** One 变强途径 entry: gray ring, icon, and caption. */
export const StrengthenWay = defineComponent<StrengthenWayProps>((p) => {
    const left = p.left;
    const top = p.top;
    const wayId = p.wayId;
    const onClick = p.onClick;
    const isSkill = wayId === 'skill';
    const isTrain = wayId === 'train';
    const isForge = wayId === 'forge';
    const icon = isSkill ? ICON_SKILL : isTrain ? ICON_TRAIN : isForge ? ICON_FORGE : ICON_RECRUIT;
    const iconLeft = isSkill ? 24 : isTrain ? 21 : isForge ? 21 : 7;
    const iconTop = isSkill ? 20 : isTrain ? 24 : isForge ? 23 : 17;
    const iconWidth = isSkill ? 70 : isTrain ? 84 : isForge ? 81 : 107;
    const iconHeight = isSkill ? 86 : isTrain ? 83 : isForge ? 81 : 86;
    const label = isSkill ? '升级技能' : isTrain ? '前往历练' : isForge ? '装备锻造' : '招募英雄';
    return (
        <view name="StrengthenWay" interaction="press" onClick={onClick}
            style={{ position: 'absolute', left: left, top: top, width: 126, height: 162 }}>
            <image name="StrengthenWay/Circle" source={CIRCLE}
                style={{ position: 'absolute', left: 0, top: 0, width: 126, height: 126 }} />
            <image name="StrengthenWay/Icon" source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <text name="StrengthenWay/Label" value={label}
                style={{ position: 'absolute', left: -17, top: 132, width: 160, height: 30,
                    font: LABEL_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        </view>
    );
});
