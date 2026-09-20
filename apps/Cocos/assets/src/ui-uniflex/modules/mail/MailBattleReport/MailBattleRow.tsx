import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';

export interface MailBattleRowProps {
    readonly title: string;
    readonly subtitle: string;
    readonly sentAt: string;
    readonly expiresAt: string;
    readonly read: boolean;
    readonly onClick?: () => void;
}

export const MailBattleRow = defineComponent<MailBattleRowProps>((p) => {
    const unreadDot = imageRef('ui/mail/unread-dot');
    return (
        <view name="MailBattleRow" interaction="press" onClick={p.onClick}
            style={{ position: 'relative', width: 730, height: 163 }}>
            <image source={imageRef('ui/mail/row')} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <image source={imageRef('ui/mail/icon-bg')} style={{ position: 'absolute', left: 23, top: 28, width: 110, height: 110, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/mail/battle-icon')} style={{ position: 'absolute', left: 33, top: 43, width: 91, height: 82 }} />
            <text value={p.title} style={{ position: 'absolute', left: 145, top: 26, width: 480, height: 36, font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true }} />
            <text value={p.subtitle} style={{ position: 'absolute', left: 145, top: 67, width: 480, height: 28, font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true }} />
            <text value={p.sentAt} style={{ position: 'absolute', left: 145, top: 94, width: 480, height: 28, font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true }} />
            <text value={p.expiresAt} style={{ position: 'absolute', left: 145, top: 119, width: 480, height: 28, font: fontRef('fonts/regular', 700), fontSize: 22, color: '#837A91', bold: true }} />
            <NotificationBadge mode="dot" visible={!p.read} source={unreadDot} left={660} top={9} />
            <image visible={p.read} source={imageRef('ui/mail/read-stamp')} style={{ position: 'absolute', left: 515, top: 77, width: 125, height: 78 }} />
            <image visible={p.read} source={imageRef('ui/mail/read-overlay')} style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        </view>
    );
});
