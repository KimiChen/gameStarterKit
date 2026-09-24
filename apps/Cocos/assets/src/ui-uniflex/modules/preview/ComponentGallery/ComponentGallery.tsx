import { defineView, useMemo, useRef, useState } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { backButton, cancelButton, confirmButton, cyanButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { IconCaptionButton } from '../../../components/button/IconCaptionButton';
import { WideMenuButton } from '../../../components/button/WideMenuButton';
import { CheckBox } from '../../../components/checkbox/CheckBox';
import { ScreenFooter, SCREEN_FOOTER_HEIGHT } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { InputText } from '../../../components/input/InputText';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { heroProgress } from '../../../components/progress/progressBarSkins';
import { QuantityControl } from '../../../components/quantity/QuantityControl';
import { TabBar, type TabBarItem } from '../../../components/tab/TabBar';
import { mailTab } from '../../../components/tab/tabSkins';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';
import { Marquee } from '../../../components/marquee/Marquee';
import { Countdown } from '../../../components/countdown/Countdown';
import { FloatingHintQueue, type FloatingHintQueueItem } from '../../../components/hint/FloatingHint';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { ItemSlot, itemIcon } from '../../../gamecomponents/item/ItemSlot';
import { RewardItem } from '../../../gamecomponents/item/RewardItem';
import { MainNav, type MainNavSlot } from '../../../gamecomponents/navigation/MainNav';
import { ResourceCounter } from '../../../gamecomponents/resource/ResourceCounter';
import { STAR_ROW_HEIGHT, STAR_ROW_WIDTH, StarRow } from '../../../gamecomponents/star/StarRow';
import { StarLevel } from '../../../gamecomponents/star/StarLevel';
import { TECH_ICON_HEIGHT, TECH_ICON_WIDTH, TechIcon } from '../../../gamecomponents/tech/TechIcon';
import { themes, type ComponentTheme, type ThemeName } from '../../../themes/active';

const PAGE_WIDTH = 750;
const PAGE_HEIGHT = 1424;
const HEADER_HEIGHT = 188;
const SCROLL_HEIGHT = PAGE_HEIGHT - HEADER_HEIGHT;
const CONTENT_HEIGHT = 5020;
const SECTION_WIDTH = 710;
const INNER_WIDTH = 674;
const HINT_WIDTH = 300;
const HINT_LEFT = (INNER_WIDTH - HINT_WIDTH) / 2;
const SECTION_GAP = 24;
const ITEM_GAP = 20;
const CHROME_GAP = 36;
const CHROME_SLOT_PAD = 24;
const SCREEN_HEADER_HEIGHT = 90;
const MAIN_NAV_HEIGHT = 125;
const HEADER_SLOT_HEIGHT = SCREEN_HEADER_HEIGHT + CHROME_SLOT_PAD;
const FOOTER_SLOT_HEIGHT = SCREEN_FOOTER_HEIGHT + CHROME_SLOT_PAD;
const NAV_SLOT_HEIGHT = MAIN_NAV_HEIGHT + CHROME_SLOT_PAD;
const POPUP_HEIGHT = 510;
const POPUP_LEFT = 21;
const POPUP_TOP = 12;
const POPUP_SLOT_HEIGHT = POPUP_HEIGHT + POPUP_TOP + CHROME_SLOT_PAD;
const QUANTITY_LAYOUT = { width: INNER_WIDTH, trackWidth: 365, plusLeft: 460, qtyLeft: 553 };
const TABS: readonly TabBarItem[] = [
    { id: 'one', label: '基础', badge: 3 },
    { id: 'two', label: '状态', notice: true },
    { id: 'three', label: '资源' },
];

export interface ComponentGalleryParams {
    readonly onBack: () => void;
}

/** Shared-component catalog. Theme switch is local to this preview. */
export const ComponentGallery = defineView<ComponentGalleryParams, void>({ zIndex: 'screen' }, (context) => {
    const [mode, setMode] = useState<ThemeName>('classic');
    const [checked, setChecked] = useState(true);
    const [radio, setRadio] = useState('a');
    const [selectedTab, setSelectedTab] = useState('one');
    const [quantity, setQuantity] = useState(3);
    const [input, setInput] = useState('主题输入');
    const [navigation, setNavigation] = useState<MainNavSlot>('hero');
    const [textHints, setTextHints] = useState<readonly FloatingHintQueueItem[]>([]);
    const [iconHints, setIconHints] = useState<readonly FloatingHintQueueItem[]>([]);
    const nextTextHintId = useRef(0);
    const nextIconHintId = useRef(0);
    const countdownTarget = useRef(new Date(Date.now() + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000).toISOString());
    const addTextHint = () => {
        nextTextHintId.current += 1;
        const id = nextTextHintId.current;
        const text = id % 3 === 1 ? '+80 经验' : id % 3 === 2 ? '+300 经验' : '+1200 经验';
        setTextHints((current) => [...current, { id, text, textWidth: 200, requestedAtMs: Date.now() }]);
    };
    const completeTextHint = (id: number) => setTextHints((current) => current.filter((item) => item.id !== id));
    const theme: ComponentTheme = mode === 'classic' ? themes.classic : themes.midnight;
    const preview = theme.preview;
    const pageBackground = preview.background;
    const pageSurface = preview.surface;
    const pageSurfaceAlt = preview.surfaceAlt;
    const pageText = preview.text;
    const pageMuted = preview.muted;
    const pageAccent = preview.accent;
    const pageOnAccent = preview.onAccent;
    const classicSelected = mode === 'classic';
    const midnightSelected = mode === 'midnight';
    const classicChip = classicSelected ? pageAccent : pageSurfaceAlt;
    const midnightChip = midnightSelected ? pageAccent : pageSurfaceAlt;
    const classicChipText = classicSelected ? pageOnAccent : pageText;
    const midnightChipText = midnightSelected ? pageOnAccent : pageText;
    const checkedLabel = checked ? '已勾选' : '未勾选';
    const radioA = radio === 'a';
    const radioB = radio === 'b';
    const font = fontRef('fonts/regular', 700);
    const gearIcon = imageRef('ui/settings/gear');
    const gemIcon = itemIcon('gem');
    const addIconHint = () => {
        nextIconHintId.current += 1;
        const id = nextIconHintId.current;
        const text = id % 3 === 1 ? '+20 宝石' : id % 3 === 2 ? '+5 宝石' : '+50 宝石';
        setIconHints((current) => [...current,
            { id, text, icon: gemIcon, textWidth: 160, requestedAtMs: Date.now() }]);
    };
    const completeIconHint = (id: number) => setIconHints((current) => current.filter((item) => item.id !== id));
    const tabSkin = useMemo(() => ({
        ...mailTab,
        selected: theme.tab.skins.mail.selected,
        unselected: theme.tab.skins.mail.unselected,
        color: theme.tab.color,
        activeColor: theme.tab.activeColor,
        badgeSource: theme.tab.badge,
        noticeSource: theme.tab.notice,
    }), [theme]);
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
    const selectTab = (id: string) => setSelectedTab(id);
    const selectClassic = () => setMode('classic');
    const selectMidnight = () => setMode('midnight');
    const onPopupClose = () => console.info('[ComponentGallery] close');
    const toggleChecked = () => setChecked(!checked);
    const pickRadioA = () => setRadio('a');
    const pickRadioB = () => setRadio('b');
    const onBack = context.params.onBack;
    return (
        <view name="ComponentGallery" style={{
            width: PAGE_WIDTH, height: PAGE_HEIGHT, backgroundColor: pageBackground,
            flexDirection: 'column',
        }}>
            <view name="GalleryHeader" style={{
                width: PAGE_WIDTH, height: HEADER_HEIGHT, backgroundColor: pageSurface,
                padding: { left: 24, right: 24, top: 16, bottom: 16 },
                flexDirection: 'column', gap: 12,
            }}>
                <view style={{ width: 702, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <view style={{ width: 64, height: 56 }}>
                        <ActionButton skin={backButton} theme={theme} width={64} height={56}
                            accessibilityLabel="返回" onClick={onBack} />
                    </view>
                    <text value="通用组件目录" style={{
                        width: 626, height: 56, font: font, fontSize: 34, color: pageText,
                        verticalAlign: 'center',
                    }} />
                </view>
                <text value="分类浏览 · 点击体验 · 切换主题" style={{
                    width: 702, height: 28, font: font, fontSize: 22, color: pageMuted,
                    verticalAlign: 'center',
                }} />
                <view style={{ width: 702, height: 48, flexDirection: 'row', gap: 12 }}>
                    <view name="ClassicTheme" accessibilityLabel="经典主题" interaction="press" onClick={selectClassic}
                        style={{
                            width: 345, height: 48, backgroundColor: classicChip,
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                        <text value="经典主题" style={{
                            width: 345, height: 48, font: font, fontSize: 24, color: classicChipText,
                            horizontalAlign: 'center', verticalAlign: 'center',
                        }} />
                    </view>
                    <view name="MidnightTheme" accessibilityLabel="午夜主题" interaction="press" onClick={selectMidnight}
                        style={{
                            width: 345, height: 48, backgroundColor: midnightChip,
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                        <text value="午夜主题" style={{
                            width: 345, height: 48, font: font, fontSize: 24, color: midnightChipText,
                            horizontalAlign: 'center', verticalAlign: 'center',
                        }} />
                    </view>
                </view>
            </view>
            <scroll-view name="ComponentGallery/Scroll" direction="vertical" inertia
                style={{ width: PAGE_WIDTH, height: SCROLL_HEIGHT }}>
                <view name="GalleryContent" style={{
                    width: PAGE_WIDTH, height: CONTENT_HEIGHT,
                    padding: { left: 20, right: 20, top: 24, bottom: 32 },
                    flexDirection: 'column', gap: SECTION_GAP, alignItems: 'center',
                }}>
                    <view name="ButtonsSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="01  按钮" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: ITEM_GAP }}>
                            <ActionButton skin={confirmSkin} theme={theme} label="确定" width={210} height={92}
                                onClick={() => console.info('[ComponentGallery] confirm')} />
                            <ActionButton skin={cancelSkin} theme={theme} label="取消" width={210} height={92}
                                onClick={() => console.info('[ComponentGallery] cancel')} />
                            <ActionButton skin={cyanSkin} theme={theme} label="前往" width={210} height={92}
                                onClick={() => console.info('[ComponentGallery] cyan')} />
                            <ActionButton skin={backButton} theme={theme} width={64} height={56}
                                accessibilityLabel="返回" onClick={() => console.info('[ComponentGallery] image')} />
                            <view style={{ width: 210, height: 74 }}>
                                <IconCaptionButton theme={theme} icon={gearIcon} label="图标按钮"
                                    left={0} top={0} width={210} iconWidth={48} iconHeight={48}
                                    onClick={() => console.info('[ComponentGallery] icon')} />
                            </view>
                            <view style={{ width: 326, height: 114 }}>
                                <WideMenuButton theme={theme} icon={gearIcon} iconWidth={46} iconHeight={46}
                                    label="宽菜单" left={0} top={0} labelWidth={160}
                                    onClick={() => console.info('[ComponentGallery] menu')} />
                            </view>
                        </view>
                    </view>
                    <view name="TabsSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="02  页签" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 82 }}>
                            <TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={15}
                                itemWidth={190} width={INNER_WIDTH} skin={tabSkin}
                                onSelect={(id) => selectTab(id)} />
                        </view>
                    </view>
                    <view name="DotSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="03  红点" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 48, flexDirection: 'row', alignItems: 'center', gap: ITEM_GAP }}>
                            <view style={{ width: 34, height: 34 }}>
                                <NotificationBadge theme={theme} mode="count" count={8} left={0} top={0} />
                            </view>
                            <view style={{ width: 24, height: 24 }}>
                                <NotificationBadge theme={theme} mode="dot" visible left={0} top={0} />
                            </view>
                        </view>
                    </view>
                    <view name="InputSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="04  输入框" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: 290, height: 56 }}>
                            <InputText theme={theme} left={0} top={0} width={290} height={56}
                                value={input} placeholder="请输入" onInput={(value) => setInput(value)} />
                        </view>
                    </view>
                    <view name="StatusSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="05  状态" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 160 }}>
                            <EmptyState theme={theme} left={283} top={4} label="空状态"
                                labelLeft={232} labelTop={124} labelWidth={210} />
                        </view>
                    </view>
                    <view name="ProgressSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="06  进度条" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 34 }}>
                            <ProgressBar theme={theme} skin={heroProgress} left={0} top={0} width={INNER_WIDTH} height={34}
                                value={72} max={100} label="72%" />
                        </view>
                    </view>
                    <view name="CheckSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="07  复选框" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view name="ToggleCheckbox" accessibilityLabel="切换复选框" interaction="press"
                            onClick={toggleChecked}
                            style={{
                                width: 210, height: 60, backgroundColor: pageSurfaceAlt,
                                flexDirection: 'row', alignItems: 'center', padding: { left: 8 },
                            }}>
                            <CheckBox theme={theme} checked={checked} size={44} hitSize={60} />
                            <text value={checkedLabel} style={{
                                width: 140, height: 60, font: font, fontSize: 24, color: pageText,
                                horizontalAlign: 'center', verticalAlign: 'center',
                            }} />
                        </view>
                    </view>
                    <view name="RadioSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="08  单选框" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 60, flexDirection: 'row', gap: ITEM_GAP }}>
                            <view name="RadioA" accessibilityLabel="选项一" interaction="press" onClick={pickRadioA}
                                style={{
                                    width: 210, height: 60, backgroundColor: pageSurfaceAlt,
                                    flexDirection: 'row', alignItems: 'center', padding: { left: 8 },
                                }}>
                                <CheckBox theme={theme} checked={radioA} size={44} hitSize={60} />
                                <text value="选项一" style={{
                                    width: 140, height: 60, font: font, fontSize: 24, color: pageText,
                                    horizontalAlign: 'center', verticalAlign: 'center',
                                }} />
                            </view>
                            <view name="RadioB" accessibilityLabel="选项二" interaction="press" onClick={pickRadioB}
                                style={{
                                    width: 210, height: 60, backgroundColor: pageSurfaceAlt,
                                    flexDirection: 'row', alignItems: 'center', padding: { left: 8 },
                                }}>
                                <CheckBox theme={theme} checked={radioB} size={44} hitSize={60} />
                                <text value="选项二" style={{
                                    width: 140, height: 60, font: font, fontSize: 24, color: pageText,
                                    horizontalAlign: 'center', verticalAlign: 'center',
                                }} />
                            </view>
                        </view>
                    </view>
                    <view name="QuantitySection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="09  数量" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, height: 85 }}>
                            <QuantityControl theme={theme} left={0} top={0} value={quantity} max={9}
                                skin={QUANTITY_LAYOUT} onChange={(value) => setQuantity(value)} />
                        </view>
                    </view>
                    <view name="MarqueeSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="跑马灯" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 56 }}>
                            <Marquee text="联盟活动即将开始，请各位成员做好准备！" left={0} top={0}
                                width={INNER_WIDTH} height={56} font={font} fontSize={26}
                                color={pageText} backgroundColor={pageSurfaceAlt} />
                        </view>
                    </view>
                    <view name="CountdownSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="倒计时" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 56 }}>
                            <Countdown target={countdownTarget.current}
                                format="D天 HH:mm:ss" left={0} top={0} width={INNER_WIDTH} height={56}
                                font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />
                        </view>
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 56 }}>
                            <Countdown durationSeconds={3 * 3600 + 4 * 60 + 5}
                                left={0} top={0} width={INNER_WIDTH} height={56}
                                font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />
                        </view>
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 56 }}>
                            <Countdown durationSeconds={5 * 60 + 30} format="mm:ss"
                                left={0} top={0} width={INNER_WIDTH} height={56}
                                font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />
                        </view>
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 56 }}>
                            <Countdown durationSeconds={86400 + 2 * 3600 + 3 * 60 + 4}
                                format="D天HH时mm分ss秒" left={0} top={0} width={INNER_WIDTH} height={56}
                                font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />
                        </view>
                    </view>
                    <view name="FloatingHintSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="飘字提示" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 132,
                            backgroundColor: pageSurfaceAlt }}>
                            <FloatingHintQueue items={textHints} onComplete={completeTextHint}
                                idleText="+1200 经验" idleTextWidth={200}
                                left={HINT_LEFT} top={74} width={HINT_WIDTH} height={50}
                                font={font} fontSize={32} />
                            <view name="FloatingText/Add" accessibilityLabel="飘字再飘一个" interaction="press"
                                onClick={addTextHint} style={{ position: 'absolute', left: 534, top: 41,
                                    width: 128, height: 50, backgroundColor: pageAccent }}>
                                <text value="再飘一个" style={{ width: 128, height: 50, font: font,
                                    fontSize: 22, color: pageOnAccent,
                                    horizontalAlign: 'center', verticalAlign: 'center' }} />
                            </view>
                        </view>
                        <view style={{ position: 'relative', width: INNER_WIDTH, height: 132,
                            backgroundColor: pageSurfaceAlt }}>
                            <FloatingHintQueue items={iconHints} onComplete={completeIconHint}
                                idleText="+50 宝石" idleIcon={gemIcon} idleTextWidth={160}
                                left={HINT_LEFT} top={74} width={HINT_WIDTH} height={50}
                                font={font} fontSize={32} />
                            <view name="FloatingIconText/Add" accessibilityLabel="图标文本再飘一个" interaction="press"
                                onClick={addIconHint} style={{ position: 'absolute', left: 534, top: 41,
                                    width: 128, height: 50, backgroundColor: pageAccent }}>
                                <text value="再飘一个" style={{ width: 128, height: 50, font: font,
                                    fontSize: 22, color: pageOnAccent,
                                    horizontalAlign: 'center', verticalAlign: 'center' }} />
                            </view>
                        </view>
                    </view>
                    <view name="ItemsSection" style={{
                        width: SECTION_WIDTH, backgroundColor: pageSurface,
                        padding: { left: 18, right: 18, top: 16, bottom: 20 },
                        flexDirection: 'column', gap: ITEM_GAP,
                    }}>
                        <text value="10  道具" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view style={{ width: INNER_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: ITEM_GAP, alignItems: 'center' }}>
                            <view style={{ width: 154, height: 159 }}>
                                <ItemSlot theme={theme} left={0} top={0} itemId="cube" count="12" />
                            </view>
                            <view style={{ width: 153, height: 45 }}>
                                <ResourceCounter theme={theme} icon={gemIcon}
                                    left={0} top={0} value="12.8K" />
                            </view>
                            <view style={{ position: 'relative', width: 488, height: 64 }}>
                                <view style={{ position: 'absolute', left: 0, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={0} />
                                </view>
                                <view style={{ position: 'absolute', left: 84, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={1} />
                                </view>
                                <view style={{ position: 'absolute', left: 168, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={2} />
                                </view>
                                <view style={{ position: 'absolute', left: 252, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={3} />
                                </view>
                                <view style={{ position: 'absolute', left: 336, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={4} />
                                </view>
                                <view style={{ position: 'absolute', left: 420, top: 0, width: 68, height: 64 }}>
                                    <StarLevel value={5} />
                                </view>
                            </view>
                            <view style={{ position: 'relative', width: STAR_ROW_WIDTH, height: STAR_ROW_HEIGHT }}>
                                <StarRow value={6} />
                            </view>
                        </view>
                        <view style={{ width: INNER_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: ITEM_GAP, alignItems: 'center' }}>
                            <view style={{ position: 'relative', width: TECH_ICON_WIDTH, height: TECH_ICON_HEIGHT }}>
                                <TechIcon left={0} top={0} kind="heart" level="1/3" />
                            </view>
                            <view style={{ position: 'relative', width: 195, height: 53 }}>
                                <RewardItem item={{ id: 'gem', itemId: 'gem', count: '30000', left: 0, top: 0 }} />
                            </view>
                            <view style={{ position: 'relative', width: 187, height: 50 }}>
                                <RewardItem item={{ id: 'leaf', itemId: 'leaf', count: '30000', left: 0, top: 0 }} />
                            </view>
                            <view style={{ position: 'relative', width: 184, height: 52 }}>
                                <RewardItem item={{ id: 'ticket', itemId: 'ticket', count: '30000', left: 0, top: 0 }} />
                            </view>
                        </view>
                    </view>
                    <view name="ChromeSection" style={{
                        width: PAGE_WIDTH, backgroundColor: pageSurface,
                        padding: { top: 16, bottom: 24 },
                        flexDirection: 'column', gap: CHROME_GAP, alignItems: 'center',
                    }}>
                        <text value="11  页头、页尾与导航" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view name="HeaderSample" style={{
                            position: 'relative', width: PAGE_WIDTH, height: HEADER_SLOT_HEIGHT,
                            backgroundColor: pageBackground,
                        }}>
                            <ScreenHeader theme={theme} title="页面标题" />
                        </view>
                        <view name="FooterSample" style={{
                            position: 'relative', width: PAGE_WIDTH, height: FOOTER_SLOT_HEIGHT,
                            backgroundColor: pageBackground,
                        }}>
                            <ScreenFooter theme={theme}
                                onBack={() => console.info('[ComponentGallery] back')} />
                        </view>
                        <view name="NavSample" style={{
                            position: 'relative', width: PAGE_WIDTH, height: NAV_SLOT_HEIGHT,
                            backgroundColor: pageBackground,
                        }}>
                            <MainNav theme={theme} selected={navigation} noticeExplore
                                onSelect={(slot) => setNavigation(slot)} />
                        </view>
                    </view>
                    <view name="PopupSection" style={{
                        width: PAGE_WIDTH, backgroundColor: pageSurface,
                        padding: { top: 16, bottom: 24 },
                        flexDirection: 'column', gap: ITEM_GAP, alignItems: 'center',
                    }}>
                        <text value="12  弹窗与关闭" style={{
                            width: INNER_WIDTH, height: 40, font: font, fontSize: 28, color: pageAccent,
                            verticalAlign: 'center',
                        }} />
                        <view name="PopupSample" style={{
                            position: 'relative', width: PAGE_WIDTH, height: POPUP_SLOT_HEIGHT,
                            backgroundColor: pageBackground,
                        }}>
                            <PopupFrame theme={theme} title="主题弹窗" left={POPUP_LEFT} top={POPUP_TOP}
                                onClose={onPopupClose} />
                        </view>
                    </view>
                </view>
            </scroll-view>
        </view>
    );
});
