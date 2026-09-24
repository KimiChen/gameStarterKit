import { defineComponent, useEffect, useMemo, useRef, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';

interface MailInboxItem { readonly id: string; readonly title: string; }

const systemItems: readonly MailInboxItem[] = [
    { id: 'system-1', title: '七日登录奖励补发' },
    { id: 'system-2', title: '七日登录奖励补发' },
    { id: 'system-3', title: '七日登录奖励补发' },
    { id: 'system-4', title: '七日登录奖励补发' },
];
const allianceItems: readonly MailInboxItem[] = [{ id: 'alliance-1', title: '成功加入联盟' }];

export const mailInboxCounts = { system: systemItems.length, alliance: allianceItems.length };

export const MailInbox = defineComponent<{
    readonly visible: boolean;
    readonly alliance: boolean;
    readonly onAction?: (action: string) => void;
}>((p) => {
    const alliance = p.alliance;
    const source = useMemo(() => new ArrayVirtualListDataSource(alliance ? allianceItems : systemItems), [alliance]);
    const controller = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => controller.current?.scrollToIndex(0, 'start', 0), [source]);
    return <view name="MailInbox" visible={p.visible} style={{ position: 'absolute', left: 34, top: 345, width: 683, height: 866 }}>
        <image source={imageRef('ui/mail/popup-list')} style={{ position: 'absolute', width: 683, height: 866 }} />
        <VirtualList source={source} key="id" itemSize={159} gap={15} direction="vertical" controller={controller} inertia elastic
            style={{ position: 'absolute', left: 11, top: 15, width: 661, height: 836 }}>
            {(item) => <MailInboxCard item={item} alliance={alliance} onClick={() => p.onAction?.(`open:${item.id}`)} />}
        </VirtualList>
    </view>;
});

export const MailInboxCard = defineComponent<{
    readonly item: MailInboxItem;
    readonly alliance: boolean;
    readonly onClick?: () => void;
}>((p) => {
    const icon = p.alliance ? imageRef('ui/mail/popup-alliance') : imageRef('ui/mail/popup-envelope');
    const iconLeft = p.alliance ? 28 : 26;
    const iconTop = p.alliance ? 28 : 26;
    const iconWidth = p.alliance ? 108 : 112;
    const iconHeight = p.alliance ? 98 : 96;
    return <view name="MailInboxCard" interaction="press" onClick={p.onClick} style={{ position: 'relative', width: 661, height: 159 }}>
        <image source={imageRef('ui/mail/popup-mail-card')} style={{ position: 'absolute', width: 661, height: 159 }} />
        <image source={imageRef('ui/mail/popup-icon-well')} style={{ position: 'absolute', left: 22, top: 17, width: 120, height: 120 }} />
        <image source={icon} style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
        <text value={p.item.title} style={{ position: 'absolute', left: 149, top: 49, width: 390, height: 34, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#837A91' }} />
        <text value="2026-9-17 15:09" style={{ position: 'absolute', left: 149, top: 83, width: 390, height: 34, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254' }} />
        <text value="UTC 2026-9-18 15:09过期" style={{ position: 'absolute', left: 149, top: 113, width: 395, height: 34, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#837A91' }} />
        <image source={imageRef('ui/mail/popup-gift')} style={{ position: 'absolute', left: 548, top: 40, width: 87, height: 78 }} />
    </view>;
});
