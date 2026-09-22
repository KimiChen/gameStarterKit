import { defineView, useMemo, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ActionButton } from '../../../components/button/ActionButton';
import { CancelButton } from '../../../components/button/CancelButton';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { CyanButton } from '../../../components/button/CyanButton';
import { IconCaptionButton } from '../../../components/button/IconCaptionButton';
import { WideMenuButton } from '../../../components/button/WideMenuButton';
import { CheckBox } from '../../../components/checkbox/CheckBox';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { InputText } from '../../../components/input/InputText';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { QuantityControl } from '../../../components/quantity/QuantityControl';
import { TabBar, type TabBarItem } from '../../../components/tab/TabBar';
import { allianceTab, characterTab, flagTab, heroDetailTab, heroListTab, mailTab } from '../../../components/tab/tabSkins';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { ItemSlot, itemIcon } from '../../../gamecomponents/item/ItemSlot';
import { RewardItem } from '../../../gamecomponents/item/RewardItem';
import { MainNav, type MainNavSlot } from '../../../gamecomponents/navigation/MainNav';
import { ResourceCounter } from '../../../gamecomponents/resource/ResourceCounter';
import { StarRow } from '../../../gamecomponents/star/StarRow';
import { TechIcon } from '../../../gamecomponents/tech/TechIcon';
import { themes } from '../../../themes/active';

const TABS: readonly TabBarItem[] = [
    { id: 'one', label: '基础', badge: 3 },
    { id: 'two', label: '状态', notice: true },
    { id: 'three', label: '资源' },
];
const STAR_LEFTS = [0, 48, 96, 144, 192];
const QUANTITY_LAYOUT = { width: 674, trackWidth: 365, plusLeft: 460, qtyLeft: 553 };
const GEM_REWARD = { id: 'gem', itemId: 'gem', count: '30000', left: 0, top: 0 };
const LEAF_REWARD = { id: 'leaf', itemId: 'leaf', count: '30000', left: 211, top: 0 };
const TICKET_REWARD = { id: 'ticket', itemId: 'ticket', count: '30000', left: 414, top: 0 };

export interface ComponentSpecimenParams {
    readonly part: string;
    readonly skin: 'classic' | 'midnight';
    readonly width: number;
    readonly height: number;
}

/** One shared component on its own canvas, for the web catalog cards. */
export const ComponentSpecimen = defineView<ComponentSpecimenParams, void>({ zIndex: 'screen' }, (context) => {
    const part = context.params.part;
    const skin = context.params.skin;
    const width = context.params.width;
    const height = context.params.height;
    const theme = skin === 'midnight' ? themes.midnight : themes.classic;
    const pageSurfaceAlt = theme.preview.surfaceAlt;
    const pageText = theme.preview.text;
    const [checked, setChecked] = useState(true);
    const [selectedTab, setSelectedTab] = useState('one');
    const [quantity, setQuantity] = useState(3);
    const [input, setInput] = useState('主题输入');
    const [navigation, setNavigation] = useState<MainNavSlot>('hero');
    const checkedLabel = checked ? '已勾选' : '未勾选';
    const font = fontRef('fonts/regular', 700);
    const gearIcon = imageRef('ui/settings/gear');
    const gemIcon = itemIcon('gem');
    const showMailTab = part === 'cmp-tabs';
    const showAllianceTab = part === 'cmp-tab-alliance';
    const showFlagTab = part === 'cmp-tab-flag';
    const showCharacterTab = part === 'cmp-tab-character';
    const showHeroListTab = part === 'cmp-tab-hero-list';
    const showHeroDetailTab = part === 'cmp-tab-hero-detail';
    const tabTop = showHeroDetailTab ? 0 : showCharacterTab ? 8 : (showFlagTab || showHeroListTab) ? 14 : 15;
    const tabItemWidth = showHeroDetailTab ? 225 : showHeroListTab ? 227 : showCharacterTab ? 195 : showFlagTab ? 170 : showAllianceTab ? 200 : 190;
    const tabGap = showHeroDetailTab ? -14 : showHeroListTab ? 0 : showCharacterTab ? 25 : showAllianceTab ? 13 : 14;
    const tabSkin = useMemo(() => {
        const badgeSource = theme.tab.badge;
        const noticeSource = theme.tab.notice;
        if (showAllianceTab) {
            const art = theme.tab.skins.alliance;
            return { ...allianceTab, selected: art.selected, unselected: art.unselected, color: theme.tab.color, activeColor: theme.tab.color, badgeSource, noticeSource };
        }
        if (showFlagTab) {
            const art = theme.tab.skins.flag;
            return { ...flagTab, selected: art.selected, unselected: art.unselected, color: theme.tab.color, activeColor: theme.tab.color, badgeSource, noticeSource };
        }
        if (showCharacterTab) {
            const art = theme.tab.skins.character;
            return { ...characterTab, selected: art.selected, unselected: art.unselected, color: theme.tab.color, activeColor: theme.tab.color, badgeSource, noticeSource };
        }
        if (showHeroListTab) {
            const art = theme.tab.skins.heroList;
            return { ...heroListTab, selected: art.selected, color: theme.tab.color, activeColor: theme.tab.activeColor, badgeSource, noticeSource };
        }
        if (showHeroDetailTab) {
            const art = theme.tab.skins.heroDetail;
            return { ...heroDetailTab, selected: art.selected, color: theme.button.label, activeColor: theme.tab.color, badgeSource, noticeSource };
        }
        const art = theme.tab.skins.mail;
        return { ...mailTab, selected: art.selected, unselected: art.unselected, color: theme.tab.color, activeColor: theme.tab.activeColor, badgeSource, noticeSource };
    }, [theme, showAllianceTab, showFlagTab, showCharacterTab, showHeroListTab, showHeroDetailTab]);
    const toggleChecked = () => setChecked(!checked);
    const selectTab = (id: string) => setSelectedTab(id);
    const onQuantity = (value: number) => setQuantity(value);
    const onInput = (value: string) => setInput(value);
    const onNav = (slot: MainNavSlot) => setNavigation(slot);
    const onClick = () => console.info('[ComponentSpecimen]', part);
    const showConfirm = part === 'cmp-confirm';
    const showCancel = part === 'cmp-cancel';
    const showCyan = part === 'cmp-cyan';
    const showAction = part === 'cmp-action';
    const showIcon = part === 'cmp-icon';
    const showMenu = part === 'cmp-menu';
    const showBadge = part === 'cmp-badge';
    const showDot = part === 'cmp-dot';
    const showCheck = part === 'cmp-check';
    const showInput = part === 'cmp-input';
    const showProgress = part === 'cmp-progress';
    const showEmpty = part === 'cmp-empty';
    const showTabs = showMailTab || showAllianceTab || showFlagTab || showCharacterTab || showHeroListTab || showHeroDetailTab;
    const showQuantity = part === 'cmp-quantity';
    const showSlot = part === 'cmp-slot';
    const showResource = part === 'cmp-resource';
    const showStars = part === 'cmp-stars';
    const showTech = part === 'cmp-tech';
    const showReward = part === 'cmp-reward';
    const showHeader = part === 'cmp-header';
    const showFooter = part === 'cmp-footer';
    const showNav = part === 'cmp-nav';
    const showPopup = part === 'cmp-popup';
    return <view name="ComponentSpecimen" style={{ width: width, height: height, position: 'relative' }}>
        <view visible={showConfirm} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ConfirmButton theme={theme} label="确定" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showCancel} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <CancelButton theme={theme} label="取消" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showCyan} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <CyanButton theme={theme} label="前往" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showAction} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton theme={theme} label="操作" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showIcon} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <IconCaptionButton theme={theme} icon={gearIcon} label="图标按钮" left={0} top={0} width={210} iconWidth={48} iconHeight={48} onClick={onClick} />
        </view>
        <view visible={showMenu} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <WideMenuButton theme={theme} icon={gearIcon} iconWidth={46} iconHeight={46} label="宽菜单" left={0} top={0} labelWidth={160} onClick={onClick} />
        </view>
        <view visible={showBadge} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <NotificationBadge theme={theme} mode="count" count={8} left={0} top={0} />
        </view>
        <view visible={showDot} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <NotificationBadge theme={theme} mode="dot" visible left={6} top={6} />
        </view>
        <view visible={showCheck} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <view name="ToggleCheckbox" accessibilityLabel="切换勾选" interaction="press" onClick={toggleChecked}
                style={{ width: 210, height: 60, backgroundColor: pageSurfaceAlt, flexDirection: 'row', alignItems: 'center', padding: { left: 8 } }}>
                <CheckBox theme={theme} checked={checked} size={44} hitSize={60} />
                <text value={checkedLabel} style={{ width: 140, height: 60, font: font, fontSize: 24, color: pageText, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
        <view visible={showInput} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <InputText theme={theme} left={0} top={0} width={290} height={56} value={input} placeholder="请输入" onInput={onInput} />
        </view>
        <view visible={showProgress} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ProgressBar theme={theme} left={0} top={0} width={674} height={34} value={72} max={100} label="72%" />
        </view>
        <view visible={showEmpty} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <EmptyState theme={theme} left={283} top={4} label="空状态" labelLeft={232} labelTop={124} labelWidth={210} />
        </view>
        <view visible={showTabs} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={tabTop} itemWidth={tabItemWidth} gap={tabGap} width={width} skin={tabSkin} onSelect={selectTab} />
        </view>
        <view visible={showQuantity} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <QuantityControl theme={theme} left={0} top={0} value={quantity} max={9} skin={QUANTITY_LAYOUT} onChange={onQuantity} />
        </view>
        <view visible={showSlot} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ItemSlot theme={theme} left={0} top={0} itemId="cube" count="12" />
        </view>
        <view visible={showResource} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ResourceCounter theme={theme} icon={gemIcon} left={0} top={0} value="12.8K" />
        </view>
        <view visible={showStars} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <StarRow theme={theme} value={4} lefts={STAR_LEFTS} top={0} width={40} height={40} />
        </view>
        <view visible={showTech} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <TechIcon left={0} top={0} kind="heart" level="1/3" />
        </view>
        <view visible={showReward} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <RewardItem item={GEM_REWARD} />
            <RewardItem item={LEAF_REWARD} />
            <RewardItem item={TICKET_REWARD} />
        </view>
        <view visible={showHeader} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ScreenHeader theme={theme} title="页面标题" />
        </view>
        <view visible={showFooter} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ScreenFooter theme={theme} onBack={onClick} />
        </view>
        <view visible={showNav} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <MainNav theme={theme} selected={navigation} noticeExplore onSelect={onNav} />
        </view>
        <view visible={showPopup} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <PopupFrame theme={theme} title="主题弹窗" left={21} top={12} onClose={onClick} />
        </view>
    </view>;
});
