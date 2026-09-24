import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ActionButton } from '../../../components/button/ActionButton';
import { yellowButton } from '../../../components/button/buttonSkins';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { MailTabs, type MailTabId } from './MailTabs';
import { MailInbox, mailInboxCounts } from './MailInbox';
import { MailReports, mailReportCount } from './MailReports';

const emptyIcon = imageRef('ui/mail/popup-empty');

export interface MailPanelProps {
    readonly visible?: boolean;
    readonly initialTab?: MailTabId;
    readonly capacity?: number;
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
    readonly onSelectTab?: (tab: MailTabId) => void;
}

export const MailPanel = defineComponent<MailPanelProps>((p) => {
    const [tab, setTab] = useState<MailTabId>(p.initialTab ?? 'report');
    const personal = tab === 'personal';
    const infoTop = personal ? 1339 : 1229;
    const count = tab === 'system' ? mailInboxCounts.system : tab === 'alliance' ? mailInboxCounts.alliance : personal ? 0 : mailReportCount;
    const countText = `邮件数：${count}/${p.capacity ?? 200}`;
    const selectTab = (next: MailTabId) => { setTab(next); p.onSelectTab?.(next); };
    return <view name="MailPanel" visible={p.visible !== false}
        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
        <PopupFrame title="邮件" left={21} top={247} width={708} height={1165} onClose={p.onClose} />
        <MailInbox visible={tab === 'system'} alliance={false} onAction={p.onAction} />
        <MailInbox visible={tab === 'alliance'} alliance={true} onAction={p.onAction} />
        <MailReports visible={tab === 'report'} onAction={p.onAction} />
        <view name="Mail/Empty" visible={personal} style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1200 }}>
            <EmptyState icon={emptyIcon} left={321} top={677} label="暂无邮件"
                labelLeft={250} labelTop={822} labelWidth={250} labelHeight={58} color="#837A91" />
        </view>
        <image name="Mail/Info" source={imageRef('ui/mail/popup-info')}
            style={{ position: 'absolute', left: 262, top: infoTop, width: 226, height: 40 }} />
        <text name="Mail/Count" value={countText}
            style={{ position: 'absolute', left: 302, top: infoTop, width: 178, height: 40,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 24, color: '#584871',
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        <view name="Mail/Actions" visible={!personal} style={{ position: 'absolute', left: 0, top: 1292, width: 750, height: 102 }}>
            <ActionButton source={imageRef('ui/mail/popup-delete')} outlineColor="#6A2A28"
                label="删除已读" left={76} top={0} width={255} height={102} onClick={() => p.onAction?.(`delete-read:${tab}`)} />
            <ActionButton skin={yellowButton} label="领取" left={418} top={0} width={255} height={102}
                onClick={() => p.onAction?.(`claim:${tab}`)} />
        </view>
        <MailTabs selected={tab} onSelect={selectTab} />
    </view>;
});
