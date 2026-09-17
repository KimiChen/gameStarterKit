import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import type { HeroCardQuality } from './HeroCard';

export interface HeroRequiredHeroProps {
    readonly quality: HeroCardQuality;
    readonly owned: boolean;
    readonly level: string;
    readonly name: string;
    readonly nameColor: string;
    readonly onClick?: () => void;
}

export const HeroRequiredHero = defineComponent<HeroRequiredHeroProps>((p) => {
    const quality = p.quality;
    const frameGreen = imageRef('ui/backpack/item-green');
    const frameBlue = imageRef('ui/backpack/item-blue');
    const framePurple = imageRef('ui/backpack/item-purple');
    const frameOrange = imageRef('ui/backpack/item-orange');
    const frameRed = imageRef('ui/backpack/item-red');
    const frame = quality === 'red' ? frameRed
        : quality === 'yellow' ? frameOrange
        : quality === 'purple' ? framePurple
        : quality === 'blue' ? frameBlue
        : frameGreen;
    const owned = p.owned;
    const nameColor = p.nameColor;
    return (
    <view name="HeroRequiredHero" interaction="press" onClick={p.onClick}
        style={{ position: 'relative', width: 158, height: 196 }}>
        <image source={frame}
            style={{ position: 'absolute', left: 4, top: 4, width: 154, height: 159, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/hero/bond-portrait')}
            style={{ position: 'absolute', left: 12, top: 13, width: 138, height: 138 }} />
        <image source={imageRef('ui/hero/bond-class')}
            style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 56 }} />
        <text visible={owned} value={p.level}
            style={{ position: 'absolute', left: 8, top: 108, width: 142, height: 40,
                font: fontRef('fonts/regular', 700), fontSize: 36, color: '#FFE57B', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        <image visible={!owned} source={imageRef('ui/hero/bond-lock')}
            style={{ position: 'absolute', left: 1, top: 0, width: 158, height: 163 }} />
        <text value={p.name}
            style={{ position: 'absolute', left: 0, top: 168, width: 158, height: 28,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: nameColor, bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
    );
});
