import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface HeroSkillSlotProps {
    readonly left: number;
    readonly top: number;
    readonly selected?: boolean;
    readonly locked?: boolean;
    readonly level?: string;
    readonly onClick?: () => void;
}

export const HeroSkillSlot = defineComponent<HeroSkillSlotProps>((p) => (
    <view name="HeroSkillSlot" interaction="press" onClick={p.onClick}
        style={{ position: 'absolute',
            left: p.selected ? p.left - 25 : p.left,
            top: p.selected ? p.top - 25 : p.top,
            width: p.selected ? 194 : 144, height: p.selected ? 198 : 159 }}>
        <image visible={p.selected === true} source={imageRef('ui/hero-detail/skill-ring')}
            style={{ position: 'absolute', left: 0, top: 0, width: 194, height: 194 }} />
        <image source={imageRef('ui/hero-detail/skill-base')}
            style={{ position: 'absolute', left: p.selected ? 25 : 0, top: p.selected ? 25 : 0, width: 144, height: 144 }} />
        <image visible={p.locked === true} source={imageRef('ui/hero-detail/skill-lock')}
            style={{ position: 'absolute', left: p.selected ? 28 : 3, top: p.selected ? 28 : 3, width: 138, height: 138 }} />
        <image source={imageRef('ui/hero-detail/skill-level-bg')}
            style={{ position: 'absolute', left: p.selected ? 37 : 12, top: p.selected ? 141 : 116, width: 120, height: 42 }} />
        <text value={p.level ?? 'Lv.1'}
            style={{ position: 'absolute', left: p.selected ? 37 : 12, top: p.selected ? 141 : 116, width: 120, height: 42,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        <image visible={p.selected === true} source={imageRef('ui/hero-detail/skill-arrow')}
            style={{ position: 'absolute', left: 60, top: -7, width: 74, height: 59 }} />
    </view>
));
