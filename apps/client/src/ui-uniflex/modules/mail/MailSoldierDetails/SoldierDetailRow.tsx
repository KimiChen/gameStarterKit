import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { MailCollapseHeaderBackground, MailCollapseHeaderControls } from '../components/MailCollapseHeader';
import type { SoldierDetailItem } from './soldierDetailsTypes';

export const SoldierDetailRow = defineComponent<{
    readonly item: SoldierDetailItem;
    readonly onToggle: () => void;
}>((p) => {
    const item = p.item;
    const height = item.height;
    const textHeight = item.header ? 58 : 76;
    const nameColor = item.side === 'own' ? '#2D8A32' : '#FF4B50';
    return <view name="SoldierDetails/Row" style={{ position: 'relative', width: 656, height: height }}>
        <view name="SoldierDetails/Soldier" visible={!item.header} style={{ position: 'absolute', width: 656, height: 83 }}>
            <image source={imageRef('ui/mail-soldier-details/list')} style={{ position: 'absolute', left: 7, width: 638, height: 83 }} />
            <view style={{ position: 'absolute', left: 7, top: 74, width: 638, height: 3, backgroundColor: '#BEB5A6' }} />
            <image source={imageRef('ui/mail-report-detail/soldier-icon')} style={{ position: 'absolute', left: 33, top: 4, width: 53, height: 64 }} />
            <text name="SoldierDetails/Tier" value={String(item.tier)} style={{ position: 'absolute', left: 49, top: 46, width: 22, height: 24,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 20, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
            <text name="SoldierDetails/Count" value={String(item.count)} style={{ position: 'absolute', left: 98, width: 125, height: 76,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        </view>
        <MailCollapseHeaderBackground visible={item.header} />
        <text visible={item.header} name="SoldierDetails/PlayerName" value={item.playerName} style={{ position: 'absolute', left: 5, width: 232, height: 58,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: nameColor, verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="SoldierDetails/Dead" value={String(item.stats.dead)} style={{ position: 'absolute', left: 235, width: 66, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="SoldierDetails/SeverelyWounded" value={String(item.stats.severelyWounded)} style={{ position: 'absolute', left: 310, width: 66, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FF4B50', horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="SoldierDetails/LightlyWounded" value={String(item.stats.lightlyWounded)} style={{ position: 'absolute', left: 386, width: 66, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="SoldierDetails/Kills" value={String(item.stats.kills)} style={{ position: 'absolute', left: 461, width: 66, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <text name="SoldierDetails/Remaining" value={String(item.stats.remaining)} style={{ position: 'absolute', left: 537, width: 66, height: textHeight,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <view name="SoldierDetails/GroupHeader" visible={item.header} style={{ position: 'absolute', width: 656, height: 62 }}>
            <MailCollapseHeaderControls expanded={item.expanded} expandable={item.expandable}
                hitMaskName="SoldierDetails/GroupHeader/HitMask" accessibilityLabel={item.playerName} onToggle={p.onToggle} />
        </view>
    </view>;
});
