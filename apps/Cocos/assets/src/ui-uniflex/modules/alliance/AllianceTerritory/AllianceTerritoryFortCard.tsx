import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { CyanButton } from '../../../components/button/CyanButton';

export interface AllianceTerritoryFortCardProps {
    readonly name: string;
    readonly subtitle?: string;
    readonly level?: string;
    readonly coord?: string;
    readonly bonus?: string;
    readonly onGo?: () => void;
}

const TITLE = '#3F3254';
const SUB = '#837A91';
const CAPTION = '#3F3254';
export const FORT_CARD_H = 217;
export const FORT_CARD_GAP = 14;

export const AllianceTerritoryFortCard = defineComponent<AllianceTerritoryFortCardProps>((p) => (
    <view name="AllianceTerritoryFortCard"
        style={{ position: 'absolute', left: 5, top: 0, width: 710, height: FORT_CARD_H }}>
        <image source={imageRef('ui/alliance/flag-fort-card')}
            style={{ position: 'absolute', width: 710, height: FORT_CARD_H, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/alliance/flag-fort-thumb')}
            style={{ position: 'absolute', left: 3, top: 4, width: 163, height: 208 }} />
        <image source={imageRef('ui/alliance/flag-star')}
            style={{ position: 'absolute', left: 10, top: 11, width: 28, height: 28 }} />
        <image source={imageRef('ui/alliance/flag-star')}
            style={{ position: 'absolute', left: 40, top: 11, width: 28, height: 28 }} />
        <image source={imageRef('ui/alliance/flag-star')}
            style={{ position: 'absolute', left: 70, top: 11, width: 28, height: 28, opacity: 0.22 }} />
        <image source={imageRef('ui/alliance/flag-star')}
            style={{ position: 'absolute', left: 100, top: 11, width: 28, height: 28, opacity: 0.22 }} />
        <image source={imageRef('ui/alliance/flag-building')}
            style={{ position: 'absolute', left: 26, top: 32, width: 111, height: 119 }} />
        <image source={imageRef('ui/alliance/flag-level-bar')}
            style={{ position: 'absolute', left: 28, top: 124, width: 113, height: 26 }} />
        <text value={p.level ?? '等级：1'}
            style={{ position: 'absolute', left: 28, top: 124, width: 113, height: 26,
                font: fontRef('fonts/regular', 700), fontSize: 18, color: '#ffffff', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={p.coord ?? 'X:110 Y:120'}
            style={{ position: 'absolute', left: 8, top: 152, width: 150, height: 22,
                font: fontRef('fonts/regular', 700), fontSize: 16, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/flag-res-small')}
            style={{ position: 'absolute', left: 8, top: 180, width: 30, height: 25 }} />
        <text value="1121"
            style={{ position: 'absolute', left: 38, top: 178, width: 52, height: 25,
                font: fontRef('fonts/regular', 700), fontSize: 16, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />
        <image source={imageRef('ui/alliance/flag-res-small')}
            style={{ position: 'absolute', left: 88, top: 180, width: 30, height: 25 }} />
        <text value={p.bonus ?? '+50%'}
            style={{ position: 'absolute', left: 118, top: 178, width: 50, height: 25,
                font: fontRef('fonts/regular', 700), fontSize: 16, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center' }} />

        <text value={p.name}
            style={{ position: 'absolute', left: 177, top: 12, width: 300, height: 36,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: TITLE, bold: true, verticalAlign: 'center' }} />
        <text value={p.subtitle ?? '要塞守军'}
            style={{ position: 'absolute', left: 177, top: 48, width: 300, height: 28,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: SUB, bold: true, verticalAlign: 'center' }} />

        <image source={imageRef('ui/alliance/flag-reward-slot')}
            style={{ position: 'absolute', left: 177, top: 79, width: 359, height: 126 }} />
        <view style={{ position: 'absolute', left: 177, top: 79, width: 359, height: 126 }}>
            <image source={imageRef('ui/backpack/item-blue')}
                style={{ position: 'absolute', left: 8, top: 4, width: 92, height: 95, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/flag-item-icon')}
                style={{ position: 'absolute', left: 16, top: 10, width: 72, height: 60 }} />
            <text value="99"
                style={{ position: 'absolute', left: 40, top: 60, width: 50, height: 28,
                    font: fontRef('fonts/regular', 700), fontSize: 20, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
            <text value="占领奖励"
                style={{ position: 'absolute', left: 8, top: 99, width: 92, height: 24,
                    font: fontRef('fonts/regular', 700), fontSize: 16, color: CAPTION, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />

            <image source={imageRef('ui/backpack/item-blue')}
                style={{ position: 'absolute', left: 119, top: 4, width: 92, height: 95, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/flag-item-icon')}
                style={{ position: 'absolute', left: 127, top: 10, width: 72, height: 60 }} />
            <text value="99"
                style={{ position: 'absolute', left: 151, top: 60, width: 50, height: 28,
                    font: fontRef('fonts/regular', 700), fontSize: 20, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
            <text value="占领奖励"
                style={{ position: 'absolute', left: 119, top: 99, width: 92, height: 24,
                    font: fontRef('fonts/regular', 700), fontSize: 16, color: CAPTION, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />

            <image source={imageRef('ui/backpack/item-blue')}
                style={{ position: 'absolute', left: 231, top: 4, width: 92, height: 95, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/flag-item-icon')}
                style={{ position: 'absolute', left: 239, top: 10, width: 72, height: 60 }} />
            <text value="99"
                style={{ position: 'absolute', left: 263, top: 60, width: 50, height: 28,
                    font: fontRef('fonts/regular', 700), fontSize: 20, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
            <text value="占领奖励"
                style={{ position: 'absolute', left: 231, top: 99, width: 92, height: 24,
                    font: fontRef('fonts/regular', 700), fontSize: 16, color: CAPTION, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>

        <view style={{ position: 'absolute', left: 552, top: 73, width: 140, height: 75 }}>
            <CyanButton label="前往" width={140} height={75} onClick={() => p.onGo?.()} />
        </view>
    </view>
));
