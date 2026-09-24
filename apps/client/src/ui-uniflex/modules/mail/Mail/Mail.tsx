import { defineView, useState } from '@uniflex/compiler';
import { MailPanel, type MailPanelProps } from './MailPanel';
import { MailContentPanel } from '../MailContent/MailContentPanel';
import { MailReportDetailPanel } from '../MailReportDetail/MailReportDetailPanel';

export type MailParams = Omit<MailPanelProps, 'visible'>;

/** 邮件弹窗：系统、联盟、战报、个人四个页签。 */
export const Mail = defineView<MailParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const [openedMail, setOpenedMail] = useState<'report' | 'content' | null>(null);
    const onAction = (action: string) => {
        if (action.startsWith('report:')) setOpenedMail('report');
        if (action === 'open:alliance-1') setOpenedMail('content');
        params.onAction?.(action);
    };
    return <view name="Mail" style={{ width: 750, height: 1624 }}>
        <MailPanel initialTab={params.initialTab} capacity={params.capacity} onClose={params.onClose}
            onAction={onAction} onSelectTab={params.onSelectTab} />
        <MailContentPanel visible={openedMail === 'content'} onClose={() => setOpenedMail(null)} onAction={params.onAction} />
        <MailReportDetailPanel visible={openedMail === 'report'} onClose={() => setOpenedMail(null)} onAction={params.onAction} />
    </view>;
});
