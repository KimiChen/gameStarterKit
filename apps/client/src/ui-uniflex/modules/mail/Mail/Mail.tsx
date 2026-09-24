import { defineView } from '@uniflex/compiler';
import { MailPanel, type MailPanelProps } from './MailPanel';

export type MailParams = Omit<MailPanelProps, 'visible'>;

/** 邮件弹窗：系统、联盟、战报、个人四个页签。 */
export const Mail = defineView<MailParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="Mail" style={{ width: 750, height: 1624 }}>
        <MailPanel initialTab={params.initialTab} capacity={params.capacity} onClose={params.onClose}
            onAction={params.onAction} onSelectTab={params.onSelectTab} />
    </view>;
});
