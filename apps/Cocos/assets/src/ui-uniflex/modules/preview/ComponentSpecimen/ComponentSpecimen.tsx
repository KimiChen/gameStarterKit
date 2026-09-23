import { defineView, useMemo, useState } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { backButton, cancelButton, closeButton, confirmButton, cyanButton, redButton, yellowButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { IconCaptionButton } from '../../../components/button/IconCaptionButton';
import { WideMenuButton } from '../../../components/button/WideMenuButton';
import { CheckBox } from '../../../components/checkbox/CheckBox';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { InputText } from '../../../components/input/InputText';
import { Dropdown, type DropdownItem } from '../../../components/dropdown/Dropdown';
import { filterDropdown } from '../../../components/dropdown/dropdownSkins';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { QuantityControl } from '../../../components/quantity/QuantityControl';
import { TabBar, type TabBarItem } from '../../../components/tab/TabBar';
import { characterTab, heroDetailTab, heroListTab, mailTab } from '../../../components/tab/tabSkins';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { ItemSlot, itemIcon } from '../../../gamecomponents/item/ItemSlot';
import { RewardItem } from '../../../gamecomponents/item/RewardItem';
import { MainNav, type MainNavSlot } from '../../../gamecomponents/navigation/MainNav';
import { ResourceCounter } from '../../../gamecomponents/resource/ResourceCounter';
import { StarRow } from '../../../gamecomponents/star/StarRow';
import { StarLevel } from '../../../gamecomponents/star/StarLevel';
import { TechIcon } from '../../../gamecomponents/tech/TechIcon';
import { themes } from '../../../themes/active';

const TABS: readonly TabBarItem[] = [
    { id: 'one', label: '基础', badge: 3 },
    { id: 'two', label: '状态', notice: true },
    { id: 'three', label: '资源' },
];
const QUANTITY_LAYOUT = { width: 674, trackWidth: 365, plusLeft: 460, qtyLeft: 553 };
const DROPDOWN_ITEMS: readonly DropdownItem[] = [
    { id: 'all', label: '全部' },
    { id: 'available', label: '可用' },
    { id: 'locked', label: '未解锁', disabled: true },
    { id: 'recent', label: '最近获得' },
    { id: 'favorite', label: '已收藏' },
    { id: 'extra', label: '更多选项' },
];
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
    const [radio, setRadio] = useState('a');
    const [selectedTab, setSelectedTab] = useState('one');
    const [quantity, setQuantity] = useState(3);
    const [input, setInput] = useState('主题输入');
    const [dropdownValue, setDropdownValue] = useState('all');
    const dropdownSkin = useMemo(() => ({ ...filterDropdown, font: theme.font, color: theme.input.color,
        triggerLabel: { left: 16, top: 8, width: 210, height: 36 },
        itemLabel: { left: 16, top: 11, width: 230, height: 28 },
    }), [theme]);
    const [navigation, setNavigation] = useState<MainNavSlot>('hero');
    const checkedLabel = checked ? '已勾选' : '未勾选';
    const radioA = radio === 'a';
    const radioB = radio === 'b';
    const font = fontRef('fonts/regular', 700);
    const gearIcon = imageRef('ui/settings/gear');
    const gemIcon = itemIcon('gem');
    const showMailTab = part === 'cmp-tabs';
    const showCharacterTab = part === 'cmp-tab-character';
    const showHeroListTab = part === 'cmp-tab-hero-list';
    const showHeroDetailTab = part === 'cmp-tab-hero-detail';
    const tabTop = showHeroDetailTab ? 0 : showCharacterTab ? 8 : showHeroListTab ? 14 : 15;
    const tabItemWidth = showHeroDetailTab ? 225 : showHeroListTab ? 227 : showCharacterTab ? 195 : 190;
    const tabGap = showHeroDetailTab ? -14 : showHeroListTab ? 0 : showCharacterTab ? 25 : 14;
    const tabSkin = useMemo(() => {
        const badgeSource = theme.tab.badge;
        const noticeSource = theme.tab.notice;
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
    }, [theme, showCharacterTab, showHeroListTab, showHeroDetailTab]);
    const toggleChecked = () => setChecked(!checked);
    const pickRadioA = () => setRadio('a');
    const pickRadioB = () => setRadio('b');
    const selectTab = (id: string) => setSelectedTab(id);
    const onQuantity = (value: number) => setQuantity(value);
    const onInput = (value: string) => setInput(value);
    const onNav = (slot: MainNavSlot) => setNavigation(slot);
    const confirmSkin = useMemo(() => ({
        ...confirmButton,
        source: theme.button.skins.confirm.source,
        outline: theme.button.skins.confirm.outline,
    }), [theme]);
    const cancelSkin = useMemo(() => ({
        ...cancelButton,
        source: theme.button.skins.cancel.source,
        outline: theme.button.skins.cancel.outline,
    }), [theme]);
    const cyanSkin = useMemo(() => ({
        ...cyanButton,
        source: theme.button.skins.cyan.source,
        outline: theme.button.skins.cyan.outline,
    }), [theme]);
    const redSkin = useMemo(() => ({
        ...redButton,
        source: theme.button.skins.red.source,
        outline: theme.button.skins.red.outline,
    }), [theme]);
    const yellowSkin = useMemo(() => ({
        ...yellowButton,
        source: theme.button.skins.yellow.source,
        outline: theme.button.skins.yellow.outline,
    }), [theme]);
    const backSkin = useMemo(() => ({
        ...backButton,
        source: theme.button.skins.back.source,
    }), [theme]);
    const closeSkin = useMemo(() => ({
        ...closeButton,
        source: theme.button.skins.close.source,
    }), [theme]);
    const closeInset = (theme.popup.closeHit - theme.popup.closeIcon) / 2;
    const onClick = () => console.info('[ComponentSpecimen]', part);
    const showConfirm = part === 'cmp-confirm';
    const showCancel = part === 'cmp-cancel';
    const showCyan = part === 'cmp-cyan';
    const showRed = part === 'cmp-red';
    const showYellow = part === 'cmp-yellow';
    const showBack = part === 'cmp-back';
    const showClose = part === 'cmp-close';
    const showIcon = part === 'cmp-icon';
    const showMenu = part === 'cmp-menu';
    const showBadge = part === 'cmp-badge';
    const showDot = part === 'cmp-dot';
    const showCheck = part === 'cmp-check';
    const showRadio = part === 'cmp-radio';
    const showInput = part === 'cmp-input';
    const showDropdown = part === 'cmp-dropdown';
    const showProgress = part === 'cmp-progress';
    const showEmpty = part === 'cmp-empty';
    const showTabs = showMailTab || showCharacterTab || showHeroListTab || showHeroDetailTab;
    const showQuantity = part === 'cmp-quantity';
    const showSlot = part === 'cmp-slot';
    const showResource = part === 'cmp-resource';
    const showStars = part === 'cmp-stars';
    const showStarRow = part === 'cmp-star-row';
    const showTech = part === 'cmp-tech';
    const showReward = part === 'cmp-reward';
    const showHeader = part === 'cmp-header';
    const showFooter = part === 'cmp-footer';
    const showNav = part === 'cmp-nav';
    const showPopup = part === 'cmp-popup';
    return <view name="ComponentSpecimen" style={{ width: width, height: height, position: 'relative' }}>
        <view visible={showConfirm} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={confirmSkin} theme={theme} label="确定" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showCancel} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={cancelSkin} theme={theme} label="取消" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showCyan} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={cyanSkin} theme={theme} label="前往" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showRed} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={redSkin} theme={theme} label="删除已读" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showYellow} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={yellowSkin} theme={theme} label="确定" width={210} height={92} onClick={onClick} />
        </view>
        <view visible={showBack} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={backSkin} theme={theme} width={64} height={56} accessibilityLabel="返回" onClick={onClick} />
        </view>
        <view visible={showClose} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={closeSkin} theme={theme} width={72} height={72} imageInset={closeInset} onClick={onClick} />
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
        <view visible={showRadio} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, flexDirection: 'row', gap: 20 }}>
            <view name="RadioA" accessibilityLabel="选项一" interaction="press" onClick={pickRadioA}
                style={{ width: 210, height: 60, backgroundColor: pageSurfaceAlt, flexDirection: 'row', alignItems: 'center', padding: { left: 8 } }}>
                <CheckBox theme={theme} checked={radioA} size={44} hitSize={60} />
                <text value="选项一" style={{ width: 140, height: 60, font: font, fontSize: 24, color: pageText, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view name="RadioB" accessibilityLabel="选项二" interaction="press" onClick={pickRadioB}
                style={{ width: 210, height: 60, backgroundColor: pageSurfaceAlt, flexDirection: 'row', alignItems: 'center', padding: { left: 8 } }}>
                <CheckBox theme={theme} checked={radioB} size={44} hitSize={60} />
                <text value="选项二" style={{ width: 140, height: 60, font: font, fontSize: 24, color: pageText, horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
        <view visible={showInput} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <InputText theme={theme} left={0} top={0} width={290} height={56} value={input} placeholder="请输入" onInput={onInput} />
        </view>
        <view visible={showDropdown} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <ActionButton skin={cancelButton} theme={theme} label="重置" left={20} top={280} width={140} height={56}
                onClick={() => setDropdownValue('all')} />
            <Dropdown items={DROPDOWN_ITEMS} selected={dropdownValue} skin={dropdownSkin}
                left={20} top={16} maxVisibleItems={4} onSelect={setDropdownValue} />
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
            <view style={{ position: 'absolute', left: 0, top: 0, width: 68, height: 64 }}><StarLevel value={0} /></view>
            <view style={{ position: 'absolute', left: 84, top: 0, width: 68, height: 64 }}><StarLevel value={1} /></view>
            <view style={{ position: 'absolute', left: 168, top: 0, width: 68, height: 64 }}><StarLevel value={2} /></view>
            <view style={{ position: 'absolute', left: 252, top: 0, width: 68, height: 64 }}><StarLevel value={3} /></view>
            <view style={{ position: 'absolute', left: 336, top: 0, width: 68, height: 64 }}><StarLevel value={4} /></view>
            <view style={{ position: 'absolute', left: 420, top: 0, width: 68, height: 64 }}><StarLevel value={5} /></view>
        </view>
        <view visible={showStarRow} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
            <StarRow value={6} />
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
