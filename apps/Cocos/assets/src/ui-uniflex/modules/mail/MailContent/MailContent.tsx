import { defineView } from '@uniflex/compiler';
import { MailContentPanel, type MailContentPanelProps } from './MailContentPanel';

export type MailContentParams = Omit<MailContentPanelProps, 'visible'>;
export const MailContent = defineView<MailContentParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailContent" style={{ width: 750, height: 1624 }}>
        <MailContentPanel subject={params.subject} paragraphs={params.paragraphs} rewardCount={params.rewardCount}
            claimed={params.claimed} onClose={params.onClose} onAction={params.onAction} />
    </view>;
});
