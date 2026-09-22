import { defineView, For } from '@uniflex/compiler';
import { imageRef, type ImageRef, fontRef } from '../../../../kits/uniflex/api/core/index';
import { WideMenuButton } from '../../../restored/components/button/WideMenuButton';
import { PopupFrame } from '../../../restored/components/popup/PopupFrame';
import { theme as activeTheme, type ComponentTheme } from '../../../themes/active';

export interface SettingsMenuItem {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
}

export interface SettingsRestoredParams {
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

const PANEL_LEFT = 21;
const PANEL_TOP = 171;
const PANEL_WIDTH = 708;
const PANEL_HEIGHT = 992;

export const SettingsRestored = defineView<SettingsRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const theme = params.theme ?? activeTheme;
    const items = params.items ?? defaultItems;
    const buttonBg = imageRef("SettingsRestored-asset-abf6c9ca3211b90dec395dfd8e164e52f6b27dde8695aba49b80a9a9c1cd004a");
    const gear = imageRef("SettingsRestored-asset-b3853c92a53eecba1429f8e27c827bc0fe1306de37efea2faa322eb043221e95");
    const psdBackground = imageRef("SettingsRestored-asset-6c6210b7a0b52bb5c662415f71a29195f349ae33f93142d9e451331b9399bccb");
    const psdCloseSource = imageRef("SettingsRestored-asset-6416cc08bbf151cce21c0a90699ecdac47654ea1ddfcdb8abb589712a5e1b8df");
    const psdTitleFont = fontRef("SettingsRestored-font-9386e356e761e6dd", 700);
    return (
        <view name="SettingsPage" style={{ width: 750, height: 1334 }}>
            <PopupFrame theme={theme} title={params.title ?? '设置'} left={18} top={136}
                width={714} height={1027} onClose={params.onClose} background={psdBackground} closeSource={psdCloseSource} titleFont={psdTitleFont} titleColor={"#e1e8c7"} titleLeft={93} titleRight={93} titleTop={34} titleHeight={80} titleOutlineWidth={0} closeRight={12} closeTop={31} closeHit={65} closeIcon={65}/>
            <view name="SettingsRestored/Content"
                style={{ position: 'absolute', left: PANEL_LEFT, top: PANEL_TOP, width: PANEL_WIDTH, height: PANEL_HEIGHT }}>
                <For each={items} key="id">
                    {(item) => <WideMenuButton theme={theme} background={buttonBg} icon={gear}
                        iconWidth={54} iconHeight={54}
                        label={item.label} left={item.left} top={item.top}
                        labelLeft={128} labelTop={30} labelWidth={184} labelHeight={54}
                        onClick={() => params.onSelect?.(item.id)} color={"#844b00"}/>}
                </For>
                <image source={imageRef('ui/settings/divider')}
                    style={{ position: 'absolute', left: 23, top: 537, width: 662, height: 3, sizeMode: 'sliced' }} />
            </view>
        </view>
    );
});
