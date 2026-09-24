import { defineView } from '@uniflex/compiler';
import { MailReportDetailPanel, type MailReportDetailPanelProps } from './MailReportDetailPanel';

export type MailReportDetailParams = Omit<MailReportDetailPanelProps, 'visible'>;
export const MailReportDetail = defineView<MailReportDetailParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailReportDetail" style={{ width: 750, height: 1624 }}>
        <MailReportDetailPanel onClose={params.onClose} onAction={params.onAction} />
    </view>;
});
