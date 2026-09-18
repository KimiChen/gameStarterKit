import { defineView } from '@uniflex/compiler';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CancelButton } from '../../components/button/CancelButton';
import { theme } from '../../themes/active';

export type RestoredPreviewTarget =
    | 'prompt-restored'
    | 'small-popup-restored'
    | 'backpack-restored'
    | 'mail-restored'
    | 'settings-restored'
    | 'character-restored'
    | 'hero-restored'
    | 'hero-detail-restored'
    | 'hero-star-upgrade-restored'
    | 'alliance-restored'
    | 'alliance-announce-restored'
    | 'alliance-create-restored'
    | 'alliance-join-restored'
    | 'alliance-member-settings-restored'
    | 'alliance-war-restored'
    | 'alliance-territory-restored'
    | 'alliance-march-boost-restored'
    | 'alliance-invite-restored'
    | 'alliance-gift-restored'
    | 'alliance-help-restored'
    | 'alliance-board-restored'
    | 'alliance-tech-restored'
    | 'shop-getitem-restored'
    | 'preview-home';

export interface RestoredPreviewHomeParams {
    readonly onNavigate: (target: RestoredPreviewTarget) => void;
}

/** Local restored-preview router: lists PSD-restored pages without mixing original previews. */
export const RestoredPreviewHome = defineView<RestoredPreviewHomeParams, void>({ zIndex: 'screen' }, (context) => {
    const go = context.params.onNavigate;
    return <view name="RestoredPreviewHome" style={{ width: 750, height: 1424, backgroundColor: '#101318', flexDirection: 'column', alignItems: 'center', padding: { top: 40 } }}>
        <text value="还原 UI 预览" style={{ width: 650, height: 72, font: theme.font, fontSize: 42, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value="选择还原界面" style={{ width: 650, height: 50, font: theme.font, fontSize: 24, color: '#aab4c4', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view style={{ width: 616, padding: { top: 36 }, gap: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flexStart', alignItems: 'flexStart' }}>
            <ConfirmButton label="提示弹窗" width={300} onClick={() => go('prompt-restored')} />
            <CancelButton label="小弹窗底板" width={300} onClick={() => go('small-popup-restored')} />
            <view interaction="press" onClick={() => go('backpack-restored')} style={{ width: 300, height: 102, backgroundColor: '#53657d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="背包界面" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('mail-restored')} style={{ width: 300, height: 102, backgroundColor: '#72558f', justifyContent: 'center', alignItems: 'center' }}>
                <text value="邮件战报" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('settings-restored')} style={{ width: 300, height: 102, backgroundColor: '#596b5e', justifyContent: 'center', alignItems: 'center' }}>
                <text value="设置界面" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('character-restored')} style={{ width: 300, height: 102, backgroundColor: '#7a5a9a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="角色管理" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero-restored')} style={{ width: 300, height: 90, backgroundColor: '#8a4a62', justifyContent: 'center', alignItems: 'center' }}>
                <text value="英雄卡牌" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero-detail-restored')} style={{ width: 300, height: 90, backgroundColor: '#c4a035', justifyContent: 'center', alignItems: 'center' }}>
                <text value="英雄详情" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('hero-star-upgrade-restored')} style={{ width: 300, height: 72, backgroundColor: '#6b4ea2', justifyContent: 'center', alignItems: 'center' }}>
                <text value="升星弹窗" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-restored')} style={{ width: 300, height: 72, backgroundColor: '#4a6a9a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟主页" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-announce-restored')} style={{ width: 300, height: 72, backgroundColor: '#3d5a80', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟公告" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-create-restored')} style={{ width: 300, height: 72, backgroundColor: '#2f6b62', justifyContent: 'center', alignItems: 'center' }}>
                <text value="创建联盟" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-join-restored')} style={{ width: 300, height: 72, backgroundColor: '#3d6b8a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="加入联盟" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-member-settings-restored')} style={{ width: 300, height: 72, backgroundColor: '#5a4a8a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="成员设置" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-war-restored')} style={{ width: 300, height: 72, backgroundColor: '#3a6a8a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟战争" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-territory-restored')} style={{ width: 300, height: 72, backgroundColor: '#2f5a72', justifyContent: 'center', alignItems: 'center' }}>
                <text value="领地旗帜" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-march-boost-restored')} style={{ width: 300, height: 72, backgroundColor: '#6a3d7a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="行军加速" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-invite-restored')} style={{ width: 300, height: 72, backgroundColor: '#5a4a72', justifyContent: 'center', alignItems: 'center' }}>
                <text value="邀请成员" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-gift-restored')} style={{ width: 300, height: 72, backgroundColor: '#6a4a3d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟礼物" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-help-restored')} style={{ width: 300, height: 72, backgroundColor: '#4a5a3d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟帮助" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-board-restored')} style={{ width: 300, height: 72, backgroundColor: '#3d4a6a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="留言板" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('alliance-tech-restored')} style={{ width: 300, height: 72, backgroundColor: '#4d3d6a', justifyContent: 'center', alignItems: 'center' }}>
                <text value="联盟科技" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('shop-getitem-restored')} style={{ width: 300, height: 72, backgroundColor: '#8a6a2d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="获取道具" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('preview-home')} style={{ width: 300, height: 90, backgroundColor: '#1e4d6b', justifyContent: 'center', alignItems: 'center' }}>
                <text value="原稿 UI 预览" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    </view>;
});
