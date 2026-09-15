import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export type HeroCardQuality = 'purple' | 'green' | 'red' | 'yellow' | 'blue';
export type HeroCardClass = 'shield' | 'sword' | 'anchor';

export interface HeroCardProps {
    readonly quality: HeroCardQuality;
    readonly classId: HeroCardClass;
    readonly owned: boolean;
    readonly level?: string;
    readonly fragments?: string;
    readonly fillWidth?: number;
    readonly stars?: number;
    readonly team?: string;
    readonly onClick?: () => void;
}

export const HeroCard = defineComponent<HeroCardProps>((p) => (
    <view name="HeroCard" interaction="press" onClick={p.onClick}
        style={{ position: 'relative', width: 170, height: 248 }}>
        <image visible={p.quality === 'purple'} source={imageRef('ui/hero/frame-purple')}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image visible={p.quality === 'green'} source={imageRef('ui/hero/frame-green')}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image visible={p.quality === 'red'} source={imageRef('ui/hero/frame-red')}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image visible={p.quality === 'yellow'} source={imageRef('ui/hero/frame-yellow')}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image visible={p.quality === 'blue'} source={imageRef('ui/hero/frame-blue')}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image source={imageRef('ui/hero/portrait')}
            style={{ position: 'absolute', left: 4, top: 4, width: 162, height: 180 }} />
        <image visible={p.classId === 'shield'} source={imageRef('ui/hero/class-shield')}
            style={{ position: 'absolute', left: 6, top: 6, width: 34, height: 42 }} />
        <image visible={p.classId === 'sword'} source={imageRef('ui/hero/class-sword')}
            style={{ position: 'absolute', left: 6, top: 6, width: 34, height: 42 }} />
        <image visible={p.classId === 'anchor'} source={imageRef('ui/hero/class-anchor')}
            style={{ position: 'absolute', left: 6, top: 6, width: 34, height: 42 }} />
        <image visible={!p.owned} source={imageRef('ui/hero/unowned')}
            style={{ position: 'absolute', left: 2, top: 0, width: 166, height: 244 }} />
        <image visible={!p.owned} source={imageRef('ui/hero/progress-track')}
            style={{ position: 'absolute', left: 23, top: 207, width: 124, height: 26 }} />
        <image visible={!p.owned} source={imageRef('ui/hero/progress-fill')}
            style={{ position: 'absolute', left: 25, top: 209, width: p.fillWidth ?? 99, height: 22, sizeMode: 'sliced' }} />
        <text visible={!p.owned} value={p.fragments ?? '9/10'}
            style={{ position: 'absolute', left: 23, top: 205, width: 124, height: 30,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text visible={p.owned} value={p.level ?? 'Lv.20'}
            style={{ position: 'absolute', left: 10, top: 168, width: 110, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
        <image visible={p.owned} source={imageRef('ui/hero/upgrade')}
            style={{ position: 'absolute', left: 126, top: 167, width: 39, height: 38 }} />
        <image visible={p.owned && (p.stars ?? 0) >= 1} source={imageRef('ui/hero/star-filled')}
            style={{ position: 'absolute', left: 8, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) < 1} source={imageRef('ui/hero/star-empty')}
            style={{ position: 'absolute', left: 8, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) >= 2} source={imageRef('ui/hero/star-filled')}
            style={{ position: 'absolute', left: 39, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) < 2} source={imageRef('ui/hero/star-empty')}
            style={{ position: 'absolute', left: 39, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) >= 3} source={imageRef('ui/hero/star-filled')}
            style={{ position: 'absolute', left: 71, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) < 3} source={imageRef('ui/hero/star-empty')}
            style={{ position: 'absolute', left: 71, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) >= 4} source={imageRef('ui/hero/star-filled')}
            style={{ position: 'absolute', left: 102, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) < 4} source={imageRef('ui/hero/star-empty')}
            style={{ position: 'absolute', left: 102, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) >= 5} source={imageRef('ui/hero/star-filled')}
            style={{ position: 'absolute', left: 133, top: 205, width: 30, height: 28 }} />
        <image visible={p.owned && (p.stars ?? 0) < 5} source={imageRef('ui/hero/star-empty')}
            style={{ position: 'absolute', left: 133, top: 205, width: 30, height: 28 }} />
        <view visible={p.owned && !!p.team} style={{ position: 'absolute', left: 127, top: 0, width: 35, height: 44 }}>
            <image source={imageRef('ui/hero/team-short')} style={{ position: 'absolute', width: 35, height: 44 }} />
            <text value={p.team ?? ''} style={{ position: 'absolute', width: 35, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                outlineColor: '#806241', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    </view>
));
