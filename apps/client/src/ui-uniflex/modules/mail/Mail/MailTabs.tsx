import { defineComponent } from '@uniflex/compiler';
import { TabBar } from '../../../components/tab/TabBar';
import { mailPopupTab } from '../../../components/tab/tabSkins';

export type MailTabId = 'system' | 'alliance' | 'report' | 'personal';
const tabs: readonly { id: MailTabId; label: string }[] = [
    { id: 'system', label: '系统' },
    { id: 'alliance', label: '联盟' },
    { id: 'report', label: '战报' },
    { id: 'personal', label: '个人' },
];

export const MailTabs = defineComponent<{
    readonly selected: MailTabId;
    readonly onSelect?: (tab: MailTabId) => void;
}>((p) => (
    <TabBar skin={mailPopupTab} items={tabs} selected={p.selected}
        left={75} top={1412} width={625} itemWidth={151} gap={7}
        onSelect={(_id, index) => p.onSelect?.(tabs[index].id)} />
));
