import { defineView, For } from '@uniflex/compiler';
import { WideMenuButton } from '../../../components/button/WideMenuButton';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { themes, type ComponentTheme, type ThemeName } from '../../../themes/active';

export interface SettingsMenuItem {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
}

export interface SettingsParams {
    readonly theme?: ComponentTheme;
    readonly title?: string;
    readonly items?: readonly SettingsMenuItem[];
    readonly onSelect?: (id: string) => void;
    readonly onClose?: () => void;
}

const defaultItems: readonly SettingsMenuItem[] = [
    { id: 'general', label: '通用设置', left: 21, top: 113 },
    { id: 'audio', label: '声音设置', left: 362, top: 113 },
    { id: 'language', label: '语言设置', left: 21, top: 254 },
    { id: 'notifications', label: '推送通知', left: 362, top: 254 },
    { id: 'privacy', label: '隐私设置', left: 21, top: 395 },
    { id: 'account', label: '用户中心', left: 21, top: 567 },
    { id: 'support', label: '客服帮助', left: 362, top: 567 },
    { id: 'terms', label: '服务条款', left: 21, top: 708 },
    { id: 'switch-account', label: '切换账号', left: 362, top: 708 },
    { id: 'exit', label: '退出游戏', left: 21, top: 849 },
];

export const Settings = defineView<SettingsParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    // Name lookup keeps every settings skin in this page's resource set.
    const skinName: ThemeName = params.theme === themes.restored ? 'restored'
        : params.theme === themes.midnight ? 'midnight' : 'classic';
    const theme = skinName === 'restored' ? themes.restored
        : skinName === 'midnight' ? themes.midnight
        : params.theme ?? themes.classic;
    const items = params.items ?? defaultItems;
    const panel = params.theme?.settings.panel ?? themes.classic.settings.panel;
    const panelLeft = params.theme?.settings.panelLeft ?? themes.classic.settings.panelLeft;
    const panelTop = params.theme?.settings.panelTop ?? themes.classic.settings.panelTop;
    const panelWidth = params.theme?.settings.panelWidth ?? themes.classic.settings.panelWidth;
    const panelHeight = params.theme?.settings.panelHeight ?? themes.classic.settings.panelHeight;
    const contentLeft = params.theme?.settings.contentLeft ?? themes.classic.settings.contentLeft;
    const contentTop = params.theme?.settings.contentTop ?? themes.classic.settings.contentTop;
    const contentWidth = params.theme?.settings.contentWidth ?? themes.classic.settings.contentWidth;
    const contentHeight = params.theme?.settings.contentHeight ?? themes.classic.settings.contentHeight;
    const titleFont = params.theme?.settings.titleFont ?? themes.classic.settings.titleFont;
    const titleColor = params.theme?.settings.titleColor ?? themes.classic.settings.titleColor;
    const titleOutline = params.theme?.settings.titleOutline ?? themes.classic.settings.titleOutline;
    const titleOutlineWidth = params.theme?.settings.titleOutlineWidth ?? themes.classic.settings.titleOutlineWidth;
    const titleLeft = params.theme?.settings.titleLeft ?? themes.classic.settings.titleLeft;
    const titleRight = params.theme?.settings.titleRight ?? themes.classic.settings.titleRight;
    const titleTop = params.theme?.settings.titleTop ?? themes.classic.settings.titleTop;
    const titleHeight = params.theme?.settings.titleHeight ?? themes.classic.settings.titleHeight;
    const close = params.theme?.settings.close ?? themes.classic.settings.close;
    const closeRight = params.theme?.settings.closeRight ?? themes.classic.settings.closeRight;
    const closeTop = params.theme?.settings.closeTop ?? themes.classic.settings.closeTop;
    const closeHit = params.theme?.settings.closeHit ?? themes.classic.settings.closeHit;
    const closeIcon = params.theme?.settings.closeIcon ?? themes.classic.settings.closeIcon;
    const menuBackground = params.theme?.settings.menuBackground ?? themes.classic.settings.menuBackground;
    const menuIcon = params.theme?.settings.menuIcon ?? themes.classic.settings.menuIcon;
    const menuColor = params.theme?.settings.menuColor ?? themes.classic.settings.menuColor;
    const menuIconWidth = params.theme?.settings.menuIconWidth ?? themes.classic.settings.menuIconWidth;
    const menuIconHeight = params.theme?.settings.menuIconHeight ?? themes.classic.settings.menuIconHeight;
    const menuLabelLeft = params.theme?.settings.menuLabelLeft ?? themes.classic.settings.menuLabelLeft;
    const menuLabelTop = params.theme?.settings.menuLabelTop ?? themes.classic.settings.menuLabelTop;
    const menuLabelWidth = params.theme?.settings.menuLabelWidth ?? themes.classic.settings.menuLabelWidth;
    const menuLabelHeight = params.theme?.settings.menuLabelHeight ?? themes.classic.settings.menuLabelHeight;
    const divider = params.theme?.settings.divider ?? themes.classic.settings.divider;
    const dividerLeft = params.theme?.settings.dividerLeft ?? themes.classic.settings.dividerLeft;
    const dividerTop = params.theme?.settings.dividerTop ?? themes.classic.settings.dividerTop;
    const dividerWidth = params.theme?.settings.dividerWidth ?? themes.classic.settings.dividerWidth;
    const dividerHeight = params.theme?.settings.dividerHeight ?? themes.classic.settings.dividerHeight;
    return (
        <view name="SettingsPage" style={{ width: 750, height: 1334 }}>
            <PopupFrame theme={theme} title={params.title ?? '设置'} left={panelLeft} top={panelTop}
                width={panelWidth} height={panelHeight} onClose={params.onClose}
                background={panel} closeSource={close} titleFont={titleFont}
                titleColor={titleColor} titleOutline={titleOutline} titleOutlineWidth={titleOutlineWidth}
                titleLeft={titleLeft} titleRight={titleRight} titleTop={titleTop} titleHeight={titleHeight}
                closeRight={closeRight} closeTop={closeTop} closeHit={closeHit} closeIcon={closeIcon} />
            <view name="Settings/Content"
                style={{ position: 'absolute', left: contentLeft, top: contentTop, width: contentWidth, height: contentHeight }}>
                <For each={items} key="id">
                    {(item) => <WideMenuButton theme={theme} background={menuBackground} icon={menuIcon}
                        iconWidth={menuIconWidth} iconHeight={menuIconHeight}
                        label={item.label} left={item.left} top={item.top}
                        labelLeft={menuLabelLeft} labelTop={menuLabelTop}
                        labelWidth={menuLabelWidth} labelHeight={menuLabelHeight}
                        color={menuColor}
                        onClick={() => params.onSelect?.(item.id)} />}
                </For>
                <image source={divider}
                    style={{ position: 'absolute', left: dividerLeft, top: dividerTop, width: dividerWidth, height: dividerHeight, sizeMode: 'sliced' }} />
            </view>
        </view>
    );
});
