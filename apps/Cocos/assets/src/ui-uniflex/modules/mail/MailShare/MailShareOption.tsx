import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import type { MailShareDestination } from './mailShareTypes';

export const MailShareOption = defineComponent<{
    readonly item: MailShareDestination;
    readonly onSelect: () => void;
}>((p) => {
    const item = p.item;
    const iconLeft = item.iconLeft;
    const iconTop = item.iconTop;
    const iconWidth = item.iconWidth;
    const iconHeight = item.iconHeight;
    return <view name="MailShare/Option" style={{ position: 'relative', width: 661, height: 173 }}>
        <image source={imageRef('ui/mail/popup-mail-card')} style={{ position: 'absolute', width: 661, height: 159 }} />
        <image name="MailShare/Icon" source={item.icon} style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
        <text name="MailShare/Label" value={item.label} style={{ position: 'absolute', left: 175, width: 452, height: 159,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 34, color: '#3F3254', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <view name="MailShare/Option/HitMask" interaction="press" accessibilityLabel={item.label} onClick={p.onSelect}
            style={{ position: 'absolute', width: 661, height: 159 }} />
    </view>;
});
