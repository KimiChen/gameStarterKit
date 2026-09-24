import { defineComponent, useEffect, useMemo, useRef, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ActionButton } from '../../../components/button/ActionButton';
import { MailContentParagraph } from './MailContentParagraph';
import { MailContentReward } from './MailContentReward';
import type { MailContentParagraph as Paragraph } from './mailContentTypes';

export interface MailContentPanelProps {
    readonly visible?: boolean;
    readonly subject?: string;
    readonly paragraphs?: readonly Paragraph[];
    readonly rewardCount?: number;
    readonly claimed?: boolean;
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}
const exampleParagraphs: readonly Paragraph[] = [
    { id: 'intro', height: 60, runs: [
        { id: 'intro-0', text: '恭喜加入联盟 [LFS]，盟友为你准备了 1 分钟的指南。', x: 0, y: 0, width: 636, color: '#3F3254' },
    ] },
    { id: 'management', height: 90, runs: [
        { id: 'management-0', text: '如何参与联盟管理：', x: 0, y: 0, width: 636, color: '#3F3254' },
        { id: 'management-1', text: '成员有不同等级：R1-R5。认真提升就有机会晋升！', x: 0, y: 30, width: 636, color: '#3F3254' },
    ] },
    { id: 'growth', height: 30, runs: [
        { id: 'growth-0', text: '如何利用联盟快速成长：', x: 0, y: 0, width: 636, color: '#3F3254' },
    ] },
    { id: 'territory', height: 120, runs: [
        { id: 'territory-0', text: '1. 迁城到联盟领地：', x: 0, y: 0, width: 236, color: '#FF4B50' },
        { id: 'territory-1', text: '在联盟领地内可以获得：领地内采', x: 236, y: 0, width: 400, color: '#3F3254' },
        { id: 'territory-2', text: '集速度加成、领地内船只速度加成、领地内船只造成伤', x: 0, y: 30, width: 636, color: '#3F3254' },
        { id: 'territory-3', text: '害加成等。', x: 0, y: 60, width: 636, color: '#3F3254' },
    ] },
    { id: 'rally', height: 90, runs: [
        { id: 'rally-0', text: '2. 参与集结战斗：', x: 0, y: 0, width: 210, color: '#FF4B50' },
        { id: 'rally-1', text: '可对大地图上的章鱼王、要塞叛军、', x: 210, y: 0, width: 426, color: '#3F3254' },
        { id: 'rally-2', text: '幽灵船等发起集结进攻，挑战成功会获得丰厚礼物。', x: 0, y: 30, width: 636, color: '#3F3254' },
    ] },
    { id: 'technology', height: 90, runs: [
        { id: 'technology-0', text: '3. 升级联盟科技：', x: 0, y: 0, width: 210, color: '#FF4B50' },
        { id: 'technology-1', text: '联盟成员可使用金币或宝石捐献科技。', x: 210, y: 0, width: 426, color: '#3F3254' },
        { id: 'technology-2', text: '科技升级后，所有成员将获得属性的加成。', x: 0, y: 30, width: 636, color: '#3F3254' },
    ] },
    { id: 'gifts', height: 90, runs: [
        { id: 'gifts-0', text: '4. 收获联盟礼物：', x: 0, y: 0, width: 210, color: '#FF4B50' },
        { id: 'gifts-1', text: '集结打怪会掉落宝箱，盟友购买礼包', x: 210, y: 0, width: 426, color: '#3F3254' },
        { id: 'gifts-2', text: '还会掉落稀有宝箱。两种宝箱所有盟友都可以领取！', x: 0, y: 30, width: 636, color: '#3F3254' },
    ] },
    { id: 'shop', height: 60, runs: [
        { id: 'shop-0', text: '5. 清空联盟商店：', x: 0, y: 0, width: 210, color: '#FF4B50' },
        { id: 'shop-1', text: '使用联盟银币在联盟商店购买稀有道', x: 210, y: 0, width: 426, color: '#3F3254' },
        { id: 'shop-2', text: '具，还有超高折扣。', x: 0, y: 30, width: 636, color: '#3F3254' },
    ] },
];
const windowImage = imageRef('ui/mail-report-detail/window');
const closeImage = imageRef('ui/mail-battle-log/close');
const deleteImage = imageRef('ui/mail/popup-delete');
const claimImage = imageRef('ui/mail-content/claim');

export const MailContentPanel = defineComponent<MailContentPanelProps>((p) => {
    const paragraphs = p.paragraphs ?? exampleParagraphs;
    const source = useMemo(() => new ArrayVirtualListDataSource(paragraphs), [paragraphs]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => { if (p.visible !== false) list.current?.scrollToIndex(0, 'start', 0); }, [p.visible]);
    return <view name="MailContentPanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="邮件内容" background={windowImage} closeSource={closeImage}
            left={19} top={221} width={714} height={1186} titleTop={6} titleHeight={58}
            titleOutline="#754C2C" titleOutlineWidth={2} closeRight={3} closeTop={2} closeHit={50} closeIcon={50}
            maskColor="#00000099" onClose={p.onClose} />
        <text name="MailContent/Subject" value={p.subject ?? '成功加入联盟'} style={{ position: 'absolute', left: 60, top: 312, width: 570, height: 44,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
        <view style={{ position: 'absolute', left: 57, top: 356, width: 638, height: 3, backgroundColor: '#DDDBD5' }} />
        <view name="MailContent/Translate" interaction="press" accessibilityLabel="翻译邮件" onClick={() => p.onAction?.('translate')}
            style={{ position: 'absolute', left: 646, top: 304, width: 50, height: 50 }}>
            <image source={imageRef('ui/mail-content/lang-plate')} style={{ position: 'absolute', left: 6, top: 6, width: 38, height: 38 }} />
            <image source={imageRef('ui/mail-content/lang')} style={{ position: 'absolute', left: 11, top: 11, width: 32, height: 32 }} />
        </view>
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" controller={list} overscan={1} inertia elastic
            style={{ position: 'absolute', left: 60, top: 370, width: 636, height: 650 }}>
            {(item) => <MailContentParagraph item={item} />}
        </VirtualList>
        <MailContentReward count={p.rewardCount ?? 99} onClick={() => p.onAction?.('reward:gem')} />
        <ActionButton source={deleteImage} label="删除" outlineColor="#6A2A28"
            left={77} top={1279} width={255} height={102} onClick={() => p.onAction?.('delete')} />
        <ActionButton source={claimImage} label={p.claimed ? '已领取' : '领取'} disabled={p.claimed} outlineColor="#715126"
            left={419} top={1279} width={255} height={102} onClick={() => p.onAction?.('claim')} />
    </view>;
});
