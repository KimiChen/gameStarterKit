import { defineView } from '@uniflex/compiler';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CancelButton } from '../../components/button/CancelButton';
import { theme } from '../../themes/active';

export type PreviewHomeTarget =
    | 'prompt'
    | 'small-popup'
    | 'backpack'
    | 'mail'
    | 'settings'
    | 'character'
    | 'hero'
    | 'hero-detail'
    | 'hero-star-upgrade'
    | 'alliance'
    | 'restored-home'
    | 'alliance-announce'
    | 'alliance-create'
    | 'alliance-join'
    | 'alliance-member-settings';

export interface PreviewHomeParams {
    readonly onNavigate: (target: PreviewHomeTarget) => void;
}

/** Local preview router: keeps feature previews discoverable without coupling production navigation. */
export const PreviewHome = defineView<PreviewHomeParams, void>({ zIndex: 'screen' }, (context) => {
    const go = context.params.onNavigate;
    return <view name="PreviewHome" style={{ width: 750, height: 1334, backgroundColor: '#101318', flexDirection: 'column', alignItems: 'center', padding: { top: 40 } }}>
        <text value="UniFlex UI 预览" style={{ width: 650, height: 72, font: theme.font, fontSize: 42, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value="选择功能界面" style={{ width: 650, height: 50, font: theme.font, fontSize: 24, color: '#aab4c4', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view style={{ padding: { top: 36 }, gap: 16, alignItems: 'center', flexDirection: 'column' }}>
            <ConfirmButton label="提示弹窗" width={300} onClick={() => go('prompt')} />
            <CancelButton label="小弹窗底板" width={300} onClick={() => go('small-popup')} />
            <view interaction="press" onClick={() => go('backpack')} style={{ width: 300, height: 102, backgroundColor: '#53657d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="背包界面" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('mail')} style={{ width: 300, height: 102, backgroundColor: '#72558f', justifyContent: 'center', alignItems: 'center' }}>
                <text value="邮件战报" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('settings')} style={{ width: 300, height: 102, backgroundColor: '#596b5e', justifyContent: 'center', alignItems: 'center' }}>
                <text value="设置界面" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('character')} style={{ width: 300, height: 102, backgroundColor: '#7a5a9a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="角色管理" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero')} style={{ width: 300, height: 90, backgroundColor: '#8a4a62', justifyContent: 'center', alignItems: 'center' }}>
                <text value="英雄卡牌" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero-detail')} style={{ width: 300, height: 90, backgroundColor: '#c4a035', justifyContent: 'center', alignItems: 'center' }}>
                <text value="英雄详情" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero-star-upgrade')} style={{ width: 300, height: 72, backgroundColor: '#6b4ea2', justifyContent: 'center', alignItems: 'center' }}>
                <text value="升星弹窗" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance')} style={{ width: 300, height: 72, backgroundColor: '#4a6a9a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟主页" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('restored-home')} style={{ width: 300, height: 90, backgroundColor: '#1e4d6b', justifyContent: 'center', alignItems: 'center' }}>
                <text value="还原 UI 预览" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-announce')} style={{ width: 300, height: 72, backgroundColor: '#3d5a80', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟公告" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-create')} style={{ width: 300, height: 72, backgroundColor: '#2f6b62', justifyContent: 'center', alignItems: 'center' }}>
                <text value="创建联盟" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-join')} style={{ width: 300, height: 72, backgroundColor: '#3d6b8a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="加入联盟" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-member-settings')} style={{ width: 300, height: 72, backgroundColor: '#5a4a8a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="成员设置" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    </view>;
});
