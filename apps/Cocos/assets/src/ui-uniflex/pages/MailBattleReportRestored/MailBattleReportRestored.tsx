import { defineView, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../components/badge/NotificationBadge';
import { ActionButton } from '../../components/button/ActionButton';
import { PanelTab } from '../../components/tab/PanelTab';
import { MailBattleRow, type MailBattleRowProps } from '../MailBattleReport/MailBattleRow';

export type MailBattleItem = Omit<MailBattleRowProps, 'onClick' | 'read'> & {
    readonly id: string;
    readonly read: boolean;
};
export interface MailBattleTab {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MailBattleItem[];
}
export type MailBattleTabs = readonly [MailBattleTab, MailBattleTab, MailBattleTab, MailBattleTab];
export interface MailBattleReportRestoredParams {
    readonly title?: string;
    readonly countText?: string;
    readonly items?: readonly MailBattleItem[];
    readonly tabs?: MailBattleTabs;
    readonly onBack?: () => void;
    readonly onDeleteRead?: () => void;
    readonly onConfirm?: () => void;
}

const defaultTabs: MailBattleTabs = [
    { id: 'system', label: '系统', items: [
        { id: 'system-maintenance', title: '停服维护公告', subtitle: '9月10日 02:00 开始维护', sentAt: '2026-9-9 18:30', expiresAt: 'UTC2026-10-9 18:30过期', read: false },
        { id: 'system-security', title: '账号安全提醒', subtitle: '检测到新设备登录', sentAt: '2026-9-9 09:12', expiresAt: 'UTC2026-10-9 09:12过期', read: true },
        { id: 'system-update', title: '版本更新完成', subtitle: '新增联盟集结与地图标记', sentAt: '2026-9-8 16:45', expiresAt: 'UTC2026-10-8 16:45过期', read: false },
        { id: 'system-compensation', title: '维护补偿到账', subtitle: '钻石×300、加速道具×5', sentAt: '2026-9-8 08:05', expiresAt: 'UTC2026-10-8 08:05过期', read: true },
    ] },
    { id: 'battle', label: '战报', items: [
        { id: 'battle-monster', title: '野怪讨伐胜利', subtitle: '击败 Lv.18 荒原巨蝎', sentAt: '2026-9-8 11:14', expiresAt: 'UTC2026-11-7 11:14过期', read: false },
        { id: 'battle-scout', title: '资源点侦察报告', subtitle: '发现 6级稀有矿脉', sentAt: '2026-9-8 10:46', expiresAt: 'UTC2026-11-7 10:46过期', read: true },
        { id: 'battle-defense', title: '城防战斗胜利', subtitle: '成功击退来犯部队', sentAt: '2026-9-8 10:18', expiresAt: 'UTC2026-11-7 10:18过期', read: false },
        { id: 'battle-gather', title: '采集队伍返回', subtitle: '获得木材 128,600', sentAt: '2026-9-8 09:52', expiresAt: 'UTC2026-11-7 09:52过期', read: true },
        { id: 'battle-rally', title: '联盟集结胜利', subtitle: '攻克黑石要塞', sentAt: '2026-9-8 09:27', expiresAt: 'UTC2026-11-7 09:27过期', read: false },
        { id: 'battle-revenge', title: '复仇目标已定位', subtitle: '敌军坐标 X:428 Y:917', sentAt: '2026-9-8 08:55', expiresAt: 'UTC2026-11-7 08:55过期', read: true },
        { id: 'battle-arena', title: '竞技场挑战结果', subtitle: '排名提升至 1,286', sentAt: '2026-9-7 22:31', expiresAt: 'UTC2026-11-6 22:31过期', read: false },
    ] },
    { id: 'alliance', label: '联盟', items: [
        { id: 'alliance-rally', title: '联盟集结邀请', subtitle: '目标：赤焰军团前哨站', sentAt: '2026-9-9 12:20', expiresAt: 'UTC2026-9-10 12:20过期', read: false },
        { id: 'alliance-help', title: '成员援助完成', subtitle: '建筑升级时间缩短 35分钟', sentAt: '2026-9-9 11:48', expiresAt: 'UTC2026-10-9 11:48过期', read: false },
        { id: 'alliance-notice', title: '联盟公告已更新', subtitle: '今晚20:00争夺中央堡垒', sentAt: '2026-9-9 10:05', expiresAt: 'UTC2026-10-9 10:05过期', read: true },
        { id: 'alliance-gift', title: '联盟礼物', subtitle: '成员购买礼包，全员可领取', sentAt: '2026-9-8 21:36', expiresAt: 'UTC2026-9-15 21:36过期', read: false },
        { id: 'alliance-donation', title: '科技捐献回馈', subtitle: '联盟贡献 +1,200', sentAt: '2026-9-8 18:02', expiresAt: 'UTC2026-10-8 18:02过期', read: true },
    ] },
    { id: 'event', label: '活动', items: [
        { id: 'event-ranking', title: '排行榜结算奖励', subtitle: '王国争霸个人排名第 26名', sentAt: '2026-9-9 08:00', expiresAt: 'UTC2026-9-16 08:00过期', read: false },
        { id: 'event-login', title: '七日签到奖励', subtitle: '史诗招募券×2 已到账', sentAt: '2026-9-9 07:15', expiresAt: 'UTC2026-9-16 07:15过期', read: true },
        { id: 'event-daily', title: '每日任务奖励', subtitle: '活跃度宝箱尚未领取', sentAt: '2026-9-8 23:50', expiresAt: 'UTC2026-9-9 23:50过期', read: false },
        { id: 'event-season', title: '赛季里程碑达成', subtitle: '解锁限定头像框', sentAt: '2026-9-8 19:40', expiresAt: 'UTC2026-9-22 19:40过期', read: false },
        { id: 'event-limited', title: '限时兑换开启', subtitle: '庆典商店新增稀有道具', sentAt: '2026-9-8 15:25', expiresAt: 'UTC2026-9-12 15:25过期', read: true },
        { id: 'event-worldboss', title: '世界首领奖励', subtitle: '伤害档位奖励已发放', sentAt: '2026-9-8 12:10', expiresAt: 'UTC2026-9-15 12:10过期', read: false },
    ] },
];

export const MailBattleReportRestored = defineView<MailBattleReportRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const [activeTab, setActiveTab] = useState(1);
    const [openedById, setOpenedById] = useState<Readonly<Record<string, boolean>>>({});
    const [deletedById, setDeletedById] = useState<Readonly<Record<string, boolean>>>({});
    const tabGroups = useMemo<MailBattleTabs>(() => params.tabs ?? (params.items
        ? [defaultTabs[0], { ...defaultTabs[1], items: params.items }, defaultTabs[2], defaultTabs[3]]
        : defaultTabs), [params.tabs, params.items]);
    const selectedTab = tabGroups[activeTab];
    const items = useMemo(
        () => selectedTab.items.filter((item) => !deletedById[item.id]),
        [selectedTab.items, deletedById],
    );
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    const listController = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => listController.current?.scrollToIndex(0, 'start', 0), [activeTab, source]);
    const tabs = [14, 195, 382, 566];
    const redButton = imageRef('ui/button/red');
    const yellowButton = imageRef('ui/button/yellow');
    const badgeSource = imageRef('ui/mail/number-badge');
    const tabWidth = (index: number) => activeTab === index ? 176 : 170;
    const unreadCounts = tabGroups.map((tab) => tab.items.reduce(
        (count, item) => count + (!deletedById[item.id] && !item.read && !openedById[item.id] ? 1 : 0),
        0,
    ));
    const badgeLeft = (index: number) => Math.min(tabs[index] + tabWidth(index) - 25, 750 - 34);
    const badgeLeft0 = badgeLeft(0);
    const badgeLeft1 = badgeLeft(1);
    const badgeLeft2 = badgeLeft(2);
    const badgeLeft3 = badgeLeft(3);
    const deleteRead = () => {
        const readItems = items.filter((item) => item.read || openedById[item.id]);
        if (readItems.length > 0) {
            setDeletedById((current) => {
                const next: Record<string, boolean> = { ...current };
                for (const item of readItems) next[item.id] = true;
                return next;
            });
        }
        params.onDeleteRead?.();
    };
    return (
        <view name="MailBattleReportRestored" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }}>
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 170, backgroundColor: '#553E78' }} />
            <image source={imageRef('ui/mail/header')} style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '邮件'} style={{ position: 'absolute', left: 38, top: 16, width: 300, height: 60, font: fontRef('fonts/regular', 700), fontSize: 40, color: '#FFFFFF', bold: true, outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />
            <PanelTab label={tabGroups[0].label} active={activeTab === 0} left={tabs[0]} top={118} width={170}
                onClick={() => setActiveTab(0)} />
            <PanelTab label={tabGroups[1].label} active={activeTab === 1} left={tabs[1]} top={118} width={170}
                onClick={() => setActiveTab(1)} />
            <PanelTab label={tabGroups[2].label} active={activeTab === 2} left={tabs[2]} top={118} width={170}
                onClick={() => setActiveTab(2)} />
            <PanelTab label={tabGroups[3].label} active={activeTab === 3} left={tabs[3]} top={118} width={170}
                onClick={() => setActiveTab(3)} />
            <NotificationBadge count={unreadCounts[0]} source={badgeSource} left={badgeLeft0} top={99} />
            <NotificationBadge count={unreadCounts[1]} source={badgeSource} left={badgeLeft1} top={99} />
            <NotificationBadge count={unreadCounts[2]} source={badgeSource} left={badgeLeft2} top={99} />
            <NotificationBadge count={unreadCounts[3]} source={badgeSource} left={badgeLeft3} top={99} />
            <VirtualList source={source} key="id" direction="vertical" itemSize={163} gap={25} overscan={2}
                controller={listController} inertia elastic style={{ position: 'absolute', left: 10, top: 236, width: 730, height: 905 }}>
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
                <ActionButton label="删除已读" source={redButton} outlineColor="#6A2A28" onClick={deleteRead} />
            </view>
            <view style={{ position: 'absolute', left: 384.125, top: 1229.25, width: 255, height: 102, scale: 0.75 }}>
                <ActionButton label="确定" source={yellowButton} outlineColor="#643E14" onClick={params.onConfirm} />
            </view>
        </view>
    );
});
