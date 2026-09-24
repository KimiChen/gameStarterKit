import { defineView } from '@uniflex/compiler';
import { MailTroopDetailsPanel, type MailTroopDetailsPanelProps } from './MailTroopDetailsPanel';

export type MailTroopDetailsParams = Omit<MailTroopDetailsPanelProps, 'visible'>;
export const MailTroopDetails = defineView<MailTroopDetailsParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailTroopDetails" style={{ width: 750, height: 1624 }}>
        <MailTroopDetailsPanel groups={params.groups} onClose={params.onClose} onAction={params.onAction} />
    </view>;
});
