import { defineView, useEffect, useMemo, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ActionButton } from '../../components/button/ActionButton';
import { MailBattleRow, type MailBattleRowProps } from './MailBattleRow';

export type MailBattleItem = Omit<MailBattleRowProps, 'onClick' | 'read'> & {
    readonly id: string;
    readonly read: boolean;
};
export interface MailBattleReportParams {
    readonly title?: string;
    readonly countText?: string;
    readonly items?: readonly MailBattleItem[];
    readonly onBack?: () => void;
    readonly onDeleteRead?: () => void;
    readonly onConfirm?: () => void;
}

const defaults: readonly MailBattleItem[] = [
    { id: 'mail-1', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 11:14', expiresAt: 'UTC2026-11-7 11:14过期', read: false },
    { id: 'mail-2', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 11:14', expiresAt: 'UTC2026-11-7 11:14过期', read: true },
    { id: 'mail-3', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 10:46', expiresAt: 'UTC2026-11-7 10:46过期', read: false },
    { id: 'mail-4', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 10:18', expiresAt: 'UTC2026-11-7 10:18过期', read: true },
    { id: 'mail-5', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 09:52', expiresAt: 'UTC2026-11-7 09:52过期', read: false },
    { id: 'mail-6', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 09:27', expiresAt: 'UTC2026-11-7 09:27过期', read: true },
    { id: 'mail-7', title: '文件夹', subtitle: '野怪报告', sentAt: '2026-9-8 08:55', expiresAt: 'UTC2026-11-7 08:55过期', read: false },
];

export const MailBattleReport = defineView<MailBattleReportParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const [activeTab, setActiveTab] = useState(1);
    const [openedById, setOpenedById] = useState<Readonly<Record<string, boolean>>>({});
    const items = params.items ?? defaults;
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    useEffect(() => () => source.dispose(), [source]);
    const tabs = [14, 195, 382, 566];
    const redButton = imageRef('ui/button/red');
    const yellowButton = imageRef('ui/button/yellow');
    const tabActive = imageRef('ui/mail/tab-active');
    const tabInactive = imageRef('ui/mail/tab-inactive');
    const tab0 = activeTab === 0 ? tabActive : tabInactive;
    const tab1 = activeTab === 1 ? tabActive : tabInactive;
    const tab2 = activeTab === 2 ? tabActive : tabInactive;
    const tab3 = activeTab === 3 ? tabActive : tabInactive;
    const tabWidth = (index: number) => activeTab === index ? 176 : 170;
    const tabHeight = (index: number) => activeTab === index ? 67 : 52;
    return (
        <view name="MailBattleReport" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }}>
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 170, backgroundColor: '#553E78' }} />
            <image source={imageRef('ui/mail/header')} style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '邮件'} style={{ position: 'absolute', left: 38, top: 16, width: 300, height: 60, font: fontRef('fonts/regular', 700), fontSize: 40, color: '#FFFFFF', bold: true, outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />
            <view interaction="press" onClick={() => setActiveTab(0)} style={{ position: 'absolute', left: tabs[0], top: activeTab === 0 ? 103 : 118, width: tabWidth(0), height: tabHeight(0) }}>
                <image source={tab0} style={{ width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text value="战报" style={{ position: 'absolute', width: '100%', height: '100%', font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => setActiveTab(1)} style={{ position: 'absolute', left: tabs[1], top: activeTab === 1 ? 103 : 118, width: tabWidth(1), height: tabHeight(1) }}>
                <image source={tab1} style={{ width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text value="战报" style={{ position: 'absolute', width: '100%', height: '100%', font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => setActiveTab(2)} style={{ position: 'absolute', left: tabs[2], top: activeTab === 2 ? 103 : 118, width: tabWidth(2), height: tabHeight(2) }}>
                <image source={tab2} style={{ width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text value="战报" style={{ position: 'absolute', width: '100%', height: '100%', font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => setActiveTab(3)} style={{ position: 'absolute', left: tabs[3], top: activeTab === 3 ? 103 : 118, width: tabWidth(3), height: tabHeight(3) }}>
                <image source={tab3} style={{ width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text value="战报" style={{ position: 'absolute', width: '100%', height: '100%', font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <image source={imageRef('ui/mail/number-badge')} style={{ position: 'absolute', left: 346, top: 99, width: 34, height: 34 }} />
            <text value="3" style={{ position: 'absolute', left: 346, top: 99, width: 34, height: 34, font: fontRef('fonts/regular', 700), fontSize: 24, color: '#FFFFFF', bold: true, horizontalAlign: 'center', verticalAlign: 'center', outlineColor: '#000000', outlineWidth: 2 }} />
            <VirtualList source={source} key="id" direction="vertical" itemSize={163} gap={25} overscan={2}
                inertia elastic style={{ position: 'absolute', left: 10, top: 236, width: 730, height: 905 }}>
                {(item) => <MailBattleRow title={item.title} subtitle={item.subtitle} sentAt={item.sentAt} expiresAt={item.expiresAt}
                    read={item.read ? true : openedById[item.id] === true}
                    onClick={() => setOpenedById((current) => ({ ...current, [item.id]: true }))} />}
            </VirtualList>
            <image source={imageRef('ui/mail/count-bg')} style={{ position: 'absolute', left: 266, top: 1166, width: 218, height: 40, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/mail/count-icon')} style={{ position: 'absolute', left: 273, top: 1171, width: 30, height: 32 }} />
            <text value={`邮件数:${params.countText ?? `${items.length}/200`}`} style={{ position: 'absolute', left: 300, top: 1166, width: 184, height: 40, font: fontRef('fonts/regular', 700), fontSize: 24, color: '#584871', bold: true, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={imageRef('ui/mail/footer')} style={{ position: 'absolute', left: 0, top: 1225, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view interaction="press" onClick={() => params.onBack?.()} style={{ position: 'absolute', left: 13, top: 1252, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')} style={{ width: 64, height: 56 }} />
            </view>
            <view style={{ position: 'absolute', left: 111.125, top: 1229.25, width: 255, height: 102, scale: 0.75 }}>
                <ActionButton label="删除已读" source={redButton} outlineColor="#6A2A28" onClick={params.onDeleteRead} />
            </view>
            <view style={{ position: 'absolute', left: 384.125, top: 1229.25, width: 255, height: 102, scale: 0.75 }}>
                <ActionButton label="确定" source={yellowButton} outlineColor="#643E14" onClick={params.onConfirm} />
            </view>
        </view>
    );
});
