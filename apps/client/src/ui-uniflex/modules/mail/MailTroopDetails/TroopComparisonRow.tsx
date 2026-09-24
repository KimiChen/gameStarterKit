import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { MailCollapseHeaderBackground, MailCollapseHeaderControls } from '../components/MailCollapseHeader';
import type { TroopComparisonItem } from './troopDetailsTypes';

export const TroopComparisonRow = defineComponent<{
    readonly item: TroopComparisonItem;
    readonly onToggle: () => void;
}>((p) => {
    const item = p.item;
    const height = item.height;
    const textHeight = item.header ? 58 : 52;
    const labelColor = item.header ? '#3F3254' : '#837A91';
    return <view name="TroopDetails/Row" style={{ position: 'relative', width: 656, height: height }}>
        <view name="TroopDetails/BonusSource" visible={!item.header} style={{ position: 'absolute', width: 656, height: 60 }}>
            <image source={imageRef('ui/mail-troop-details/body')} style={{ position: 'absolute', left: 7, width: 638, height: 60 }} />
            <view style={{ position: 'absolute', left: 7, top: 48, width: 638, height: 3, backgroundColor: '#BEB5A6' }} />
        </view>
        <MailCollapseHeaderBackground visible={item.header} />
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
            <MailCollapseHeaderControls expanded={item.expanded} expandable={item.expandable}
                hitMaskName="TroopDetails/BonusHeader/HitMask" accessibilityLabel={item.label} onToggle={p.onToggle} />
        </view>
    </view>;
});
