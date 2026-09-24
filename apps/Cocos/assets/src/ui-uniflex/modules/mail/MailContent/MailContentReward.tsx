import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export const MailContentReward = defineComponent<{
    readonly count: number;
    readonly onClick?: () => void;
}>((p) => (
    <view name="MailContent/Rewards" style={{ position: 'absolute', left: 38, top: 1050, width: 673, height: 168 }}>
        <image source={imageRef('ui/mail-content/reward')} style={{ position: 'absolute', width: 673, height: 168 }} />
        <text value="奖励" style={{ position: 'absolute', top: 8, width: 673, height: 48,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view name="MailContent/RewardItem" interaction="press" onClick={p.onClick} accessibilityLabel="钻石奖励"
            style={{ position: 'absolute', left: 291, top: 58, width: 93, height: 95 }}>
            <image source={imageRef('ui/mail-content/item')} style={{ position: 'absolute', width: 93, height: 95 }} />
            <text name="MailContent/RewardCount" value={String(p.count)} style={{ position: 'absolute', right: 7, bottom: 4, width: 76, height: 28,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 22, color: '#FFFFFF', outlineColor: '#16151A', outlineWidth: 2,
                horizontalAlign: 'right', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        </view>
    </view>
));
