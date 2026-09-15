import { defineView, For } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../components/popup/PopupFrame';
import { SettingsMenuButton } from './SettingsMenuButton';

export interface SettingsMenuItem {
    readonly id: string;
    readonly label: string;
    readonly left: number;
    readonly top: number;
}

export interface SettingsParams {
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
    const items = params.items ?? defaultItems;
    return (
        <PopupFrame title={params.title ?? '设置'} kind="settings" width={708} height={992} onClose={params.onClose}>
            <view name="Settings/Content" style={{ width: '100%', height: '100%' }}>
                <For each={items} key="id">
                    {(item) => <SettingsMenuButton id={item.id} label={item.label} left={item.left} top={item.top} onSelect={params.onSelect} />}
                </For>
                <image source={imageRef('ui/settings/divider')}
                    style={{ position: 'absolute', left: 23, top: 537, width: 662, height: 3, sizeMode: 'sliced' }} />
            </view>
        </PopupFrame>
    );
});
