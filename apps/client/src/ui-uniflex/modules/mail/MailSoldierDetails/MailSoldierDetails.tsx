import { defineView } from '@uniflex/compiler';
import { MailSoldierDetailsPanel, type MailSoldierDetailsPanelProps } from './MailSoldierDetailsPanel';

export type MailSoldierDetailsParams = Omit<MailSoldierDetailsPanelProps, 'visible'>;
export const MailSoldierDetails = defineView<MailSoldierDetailsParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailSoldierDetails" style={{ width: 750, height: 1624 }}>
        <MailSoldierDetailsPanel groups={params.groups} onClose={params.onClose} onAction={params.onAction} />
    </view>;
});
