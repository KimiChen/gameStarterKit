import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { StarRow } from '../../../components/star/StarRow';

export interface HeroDetailAttributesProps {
    readonly visible?: boolean;
    readonly power?: string;
    readonly level?: string;
    readonly stars?: number;
    readonly stats?: readonly string[];
    readonly cost?: string;
    readonly onPowerInfo?: () => void;
    readonly onStarUp?: () => void;
    readonly onUpgrade?: () => void;
}

const STAR_LEFTS = [170, 256, 342, 427, 513] as const;

export const HeroDetailAttributes = defineComponent<HeroDetailAttributesProps>((p) => {
    const stars = p.stars ?? 0;
    const stats = p.stats ?? ['3941', '3941', '3941', '3941'];
    const starEmpty = imageRef('ui/hero-detail/star-empty');
    const starFilled = imageRef('ui/hero-detail/star-filled');
    const starLefts = STAR_LEFTS;
    return (
        <view name="HeroDetailAttributes" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero-detail/rank-s')}
                style={{ position: 'absolute', left: 75, top: 199, width: 122, height: 160 }} />
            <image source={imageRef('ui/hero-detail/faction')}
                style={{ position: 'absolute', left: 280, top: 263, width: 59, height: 71 }} />
            <image source={imageRef('ui/hero-detail/bond-icon')}
                style={{ position: 'absolute', left: 352, top: 270, width: 50, height: 53 }} />
            <image source={imageRef('ui/hero-detail/bond-icon')}
                style={{ position: 'absolute', left: 415, top: 270, width: 50, height: 53 }} />
            <view interaction="press" onClick={() => p.onPowerInfo?.()}
                style={{ position: 'absolute', left: 185, top: 869, width: 381, height: 74 }}>
                <image source={imageRef('ui/hero-detail/power-bg')} style={{ width: 381, height: 74 }} />
                <image source={imageRef('ui/hero-detail/power-fist')}
                    style={{ position: 'absolute', left: 24, top: 8, width: 58, height: 54 }} />
                <text value={p.power ?? '9,999k'}
                    style={{ position: 'absolute', left: 90, top: 4, width: 250, height: 66,
                        font: fontRef('fonts/regular', 700), fontSize: 52, color: '#ffffff', bold: true,
                        outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />
                <image source={imageRef('ui/hero-detail/power-info')}
                    style={{ position: 'absolute', left: 333, top: 17, width: 40, height: 40 }} />
            </view>
            <StarRow filled={starFilled} empty={starEmpty} value={stars}
                lefts={starLefts} top={950} width={68} height={64}
                filledWidth={61} filledHeight={58} />
            <view interaction="press" onClick={() => p.onStarUp?.()}
                style={{ position: 'absolute', left: 603, top: 956, width: 76, height: 85 }}>
                <image source={imageRef('ui/hero-detail/star-button')} style={{ width: 76, height: 85 }} />
            </view>
            <image source={imageRef('ui/hero-detail/attr-header')}
                style={{ position: 'absolute', left: 21, top: 1041, width: 708, height: 47, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/hero-detail/attr-body')}
                style={{ position: 'absolute', left: 21, top: 1088, width: 708, height: 95, sizeMode: 'sliced' }} />
            <text value={p.level ?? 'Lv.99'}
                style={{ position: 'absolute', left: 21, top: 1037, width: 708, height: 52,
                    font: fontRef('fonts/regular', 700), fontSize: 42, color: '#FFE57B', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero-detail/attr-sword')}
                style={{ position: 'absolute', left: 49, top: 1098, width: 48, height: 72 }} />
            <text value={stats[0] ?? '3941'}
                style={{ position: 'absolute', left: 100, top: 1110, width: 110, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero-detail/attr-shield')}
                style={{ position: 'absolute', left: 222, top: 1100, width: 52, height: 64 }} />
            <text value={stats[1] ?? '3941'}
                style={{ position: 'absolute', left: 276, top: 1110, width: 110, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero-detail/attr-icon4')}
                style={{ position: 'absolute', left: 402, top: 1100, width: 56, height: 52 }} />
            <text value={stats[2] ?? '3941'}
                style={{ position: 'absolute', left: 460, top: 1110, width: 110, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero-detail/attr-icon5')}
                style={{ position: 'absolute', left: 575, top: 1102, width: 52, height: 48 }} />
            <text value={stats[3] ?? '3941'}
                style={{ position: 'absolute', left: 628, top: 1110, width: 90, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <view interaction="press" onClick={() => p.onUpgrade?.()}
                style={{ position: 'absolute', left: 227, top: 1220, width: 297, height: 109 }}>
                <image source={imageRef('ui/hero-detail/upgrade-bg')}
                    style={{ width: 297, height: 109, sizeMode: 'sliced' }} />
                <text value="升级"
                    style={{ position: 'absolute', left: 0, top: 12, width: 297, height: 44,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#ffffff', bold: true,
                        outlineColor: '#643E14', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
                <image source={imageRef('ui/hero-detail/upgrade-cost-bg')}
                    style={{ position: 'absolute', left: 29, top: 57, width: 240, height: 28 }} />
                <image source={imageRef('ui/backpack/resource-diamond')}
                    style={{ position: 'absolute', left: 19, top: 55, width: 37, height: 31 }} />
                <text value={p.cost ?? '999.99k/999.99k'}
                    style={{ position: 'absolute', left: 58, top: 54, width: 210, height: 32,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#65EE62', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    );
});
