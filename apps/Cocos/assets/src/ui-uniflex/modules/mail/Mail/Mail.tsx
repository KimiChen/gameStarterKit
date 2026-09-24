import { defineView, useState } from '@uniflex/compiler';
import { MailPanel, type MailPanelProps } from './MailPanel';
import { MailReportDetailPanel } from '../MailReportDetail/MailReportDetailPanel';

export type MailParams = Omit<MailPanelProps, 'visible'>;

/** 邮件弹窗：系统、联盟、战报、个人四个页签。 */
export const Mail = defineView<MailParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const [reportOpen, setReportOpen] = useState(false);
    const onAction = (action: string) => {
        if (action.startsWith('report:')) setReportOpen(true);
        params.onAction?.(action);
    };
    return <view name="Mail" style={{ width: 750, height: 1624 }}>
        <MailPanel initialTab={params.initialTab} capacity={params.capacity} onClose={params.onClose}
            onAction={onAction} onSelectTab={params.onSelectTab} />
        <MailReportDetailPanel visible={reportOpen} onClose={() => setReportOpen(false)} onAction={params.onAction} />
    </view>;
});
