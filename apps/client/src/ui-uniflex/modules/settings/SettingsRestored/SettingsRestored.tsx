import { defineView, For } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { WideMenuButton } from '../../../restored/components/button/WideMenuButton';
import { PopupFrame } from '../../../restored/components/popup/PopupFrame';

export interface SettingsMenuItem {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
}

export interface SettingsRestoredParams {
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
    const items = params.items ?? defaultItems;
    const buttonBg = imageRef('ui/settings/button');
    const gear = imageRef('ui/settings/gear');
    return (
        <view name="SettingsPage" style={{ width: 750, height: 1334 }}>
            <PopupFrame title={params.title ?? '设置'} kind="settings" left={PANEL_LEFT} top={PANEL_TOP}
                width={PANEL_WIDTH} height={PANEL_HEIGHT} onClose={params.onClose} titleColor={"#ffffff"} titleOutline={"#593d84"}/>
            <view name="SettingsRestored/Content"
                style={{ position: 'absolute', left: PANEL_LEFT, top: PANEL_TOP, width: PANEL_WIDTH, height: PANEL_HEIGHT }}>
                <For each={items} key="id">
                    {(item) => <WideMenuButton background={buttonBg} icon={gear}
                        iconWidth={54} iconHeight={54}
                        label={item.label} left={item.left} top={item.top}
                        labelLeft={128} labelTop={30} labelWidth={184} labelHeight={54}
                        onClick={() => params.onSelect?.(item.id)} />}
                </For>
                <image source={imageRef('ui/settings/divider')}
                    style={{ position: 'absolute', left: 23, top: 537, width: 662, height: 3, sizeMode: 'sliced' }} />
            </view>
        </view>
    );
});
