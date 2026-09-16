import { defineView, For } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../components/popup/PopupFrame';
import { SettingsMenuButton } from '../Settings/SettingsMenuButton';

export interface SettingsMenuItem {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly icon?: ImageRef;
    readonly iconLeft?: number;
    readonly iconTop?: number;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
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
    { id: 'notifications', label: '推送通知', left: 362, top: 254, icon: imageRef("SettingsRestored-asset-25e60a05cef1895a4eea985d01fd18bb01c0f523c28accd14a1df2486bb627c9"), iconLeft: 30, iconTop: 28, iconWidth: 60, iconHeight: 60 },
    { id: 'privacy', label: '隐私设置', left: 21, top: 395 },
    { id: 'account', label: '用户中心', left: 21, top: 567 },
    { id: 'support', label: '客服帮助', left: 362, top: 567 },
    { id: 'terms', label: '服务条款', left: 21, top: 708 },
    { id: 'switch-account', label: '切换账号', left: 362, top: 708 },
    { id: 'exit', label: '退出游戏', left: 21, top: 849 },
];

export const SettingsRestored = defineView<SettingsRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const items = params.items ?? defaultItems;
    return (
        <PopupFrame title={params.title ?? '设置'} kind="settings" width={708} height={992} onClose={params.onClose}>
            <view name="SettingsRestored/Content" style={{ width: '100%', height: '100%' }}>
                <For each={items} key="id">
                    {(item) => <SettingsMenuButton id={item.id} label={item.label} left={item.left} top={item.top} onSelect={params.onSelect} icon={item.icon} iconLeft={item.iconLeft} iconTop={item.iconTop} iconWidth={item.iconWidth} iconHeight={item.iconHeight} />}
                </For>
                <image source={imageRef('ui/settings/divider')}
                    style={{ position: 'absolute', left: 23, top: 537, width: 662, height: 3, sizeMode: 'sliced' }} />
            </view>
        </PopupFrame>
    );
});
