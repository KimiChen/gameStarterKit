import { defineView } from '@uniflex/compiler';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CancelButton } from '../../components/button/CancelButton';
import { theme } from '../../themes/active';

export interface PreviewHomeParams {
    readonly onNavigate: (target: 'prompt' | 'small-popup' | 'backpack' | 'mail') => void;
}

/** Local preview router: keeps feature previews discoverable without coupling production navigation. */
export const PreviewHome = defineView<PreviewHomeParams, void>({ zIndex: 'screen' }, (context) => {
    const go = context.params.onNavigate;
    return <view name="PreviewHome" style={{ width: 750, height: 1334, backgroundColor: '#101318', flexDirection: 'column', alignItems: 'center', padding: { top: 180 } }}>
        <text value="UniFlex UI 预览" style={{ width: 650, height: 72, font: theme.font, fontSize: 42, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value="选择功能界面" style={{ width: 650, height: 50, font: theme.font, fontSize: 24, color: '#aab4c4', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view style={{ padding: { top: 60 }, gap: 24, alignItems: 'center' }}>
            <ConfirmButton label="提示弹窗" width={300} onClick={() => go('prompt')} />
            <CancelButton label="小弹窗底板" width={300} onClick={() => go('small-popup')} />
            <view interaction="press" onClick={() => go('backpack')} style={{ width: 300, height: 102, backgroundColor: '#53657d', justifyContent: 'center', alignItems: 'center' }}>
                <text value="背包界面" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => go('mail')} style={{ width: 300, height: 102, backgroundColor: '#72558f', justifyContent: 'center', alignItems: 'center' }}>
                <text value="邮件战报" style={{ width: '100%', height: '100%', font: theme.font, fontSize: 34, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    </view>;
});
