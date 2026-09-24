import { defineComponent, For } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export type MailTabId = 'system' | 'alliance' | 'report' | 'personal';
const tabs: readonly { id: MailTabId; label: string; left: number }[] = [
    { id: 'system', label: '系统', left: 75 },
    { id: 'alliance', label: '联盟', left: 233 },
    { id: 'report', label: '战报', left: 392 },
    { id: 'personal', label: '个人', left: 550 },
];

export const MailTabs = defineComponent<{
    readonly selected: MailTabId;
    readonly onSelect?: (tab: MailTabId) => void;
}>((p) => (
    // Clip the 28px tucked behind the window; captions center in the exposed 63px.
    <scroll-view name="MailTabs" direction="horizontal"
        style={{ position: 'absolute', left: 0, top: 1412, width: 750, height: 63 }}>
        <view style={{ width: 750, height: 63 }}>
            <For each={tabs} key="id">{(tab) => (
                <view name="Mail/Tab" interaction="press" onClick={() => p.onSelect?.(tab.id)}
                    style={{ position: 'absolute', left: tab.left, top: 0, width: 151, height: 63 }}>
                    <image source={p.selected === tab.id ? imageRef('ui/mail/popup-tab-on') : imageRef('ui/mail/popup-tab-off')}
                        style={{ position: 'absolute', left: 0, top: -28, width: 151, height: 91 }} />
                    <text value={tab.label} style={{ position: 'absolute', width: 151, height: 63,
                        font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
                </view>
            )}</For>
        </view>
    </scroll-view>
));
