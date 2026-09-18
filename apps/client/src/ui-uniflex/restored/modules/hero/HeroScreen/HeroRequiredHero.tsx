import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../../kits/uniflex/api/core/index';
import { ItemSlot, type ItemQuality } from '../../../components/item/ItemSlot';
import type { HeroCardQuality } from './HeroCard';

export interface HeroRequiredHeroProps {
    readonly quality: HeroCardQuality;
    readonly owned: boolean;
    readonly level: string;
    readonly name: string;
    readonly nameColor: string;
    readonly onClick?: () => void;
}

function slotQuality(quality: HeroCardQuality): ItemQuality {
    return quality === 'yellow' ? 'orange' : quality;
}

export const HeroRequiredHero = defineComponent<HeroRequiredHeroProps>((p) => (
    <view name="HeroRequiredHero" interaction="press" onClick={p.onClick}
        style={{ position: 'relative', width: 158, height: 196 }}>
        <ItemSlot left={4} top={4} quality={slotQuality(p.quality)} />
        <image source={imageRef('ui/hero/bond-portrait')}
            style={{ position: 'absolute', left: 12, top: 13, width: 138, height: 138 }} />
        <image source={imageRef('ui/hero/bond-class')}
            style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 56 }} />
        <text visible={p.owned} value={p.level}
            style={{ position: 'absolute', left: 8, top: 108, width: 142, height: 40,
                font: fontRef('fonts/regular', 700), fontSize: 36, color: '#FFE57B', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        <image visible={!p.owned} source={imageRef('ui/hero/bond-lock')}
            style={{ position: 'absolute', left: 1, top: 0, width: 158, height: 163 }} />
        <text value={p.name}
            style={{ position: 'absolute', left: 0, top: 168, width: 158, height: 28,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: p.nameColor, bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
