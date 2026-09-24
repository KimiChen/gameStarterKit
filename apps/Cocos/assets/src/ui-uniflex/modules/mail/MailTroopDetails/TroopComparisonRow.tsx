import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import type { TroopComparisonItem } from './troopDetailsTypes';

export const TroopComparisonRow = defineComponent<{
    readonly item: TroopComparisonItem;
    readonly onToggle: () => void;
}>((p) => {
    const item = p.item;
    const height = item.height;
    const textHeight = item.header ? 58 : 52;
    const labelColor = item.header ? '#3F3254' : '#837A91';
    const arrowRotation = item.expanded ? 'rot:180' : 'rot:0';
    return <view name="TroopDetails/Row" style={{ position: 'relative', width: 656, height: height }}>
        <view name="TroopDetails/BonusSource" visible={!item.header} style={{ position: 'absolute', width: 656, height: 60 }}>
            <image source={imageRef('ui/mail-troop-details/body')} style={{ position: 'absolute', left: 7, width: 638, height: 60 }} />
            <view style={{ position: 'absolute', left: 7, top: 48, width: 638, height: 3, backgroundColor: '#BEB5A6' }} />
        </view>
        <image visible={item.header} source={imageRef('ui/mail-troop-details/row')}
            style={{ position: 'absolute', width: 656, height: 62 }} />
        <text name="TroopDetails/Own" value={item.own} style={{ position: 'absolute', left: 30, width: 110, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#2D8A32',
            horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="TroopDetails/BonusName" value={item.label} style={{ position: 'absolute', left: 180, width: 290, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: labelColor,
            horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="TroopDetails/Enemy" value={item.enemy} style={{ position: 'absolute', left: 515, width: 90, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FF4B50',
            horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <view name="TroopDetails/BonusHeader" visible={item.header} style={{ position: 'absolute', width: 656, height: 62 }}>
            <image name={arrowRotation} visible={item.expandable} source={imageRef('ui/mail-battle-log/section-arrow')}
                style={{ position: 'absolute', left: 610, top: 18, width: 34, height: 22 }} />
            {/* Transparent input mask keeps the comparison row still while pressed. */}
            <view name="TroopDetails/BonusHeader/HitMask" interaction="press" interactable={item.expandable}
                accessibilityLabel={item.label} onClick={p.onToggle} style={{ position: 'absolute', width: '100%', height: '100%' }} />
        </view>
    </view>;
});
