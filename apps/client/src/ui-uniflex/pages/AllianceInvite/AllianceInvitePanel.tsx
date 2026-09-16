import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CloseButton } from '../../components/popup/CloseButton';
import { PopupBackground } from '../../components/popup/PopupBackground';

export interface AllianceInvitePanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly placeholder?: string;
    readonly emptyText?: string;
    readonly inviteLabel?: string;
    readonly publicLabel?: string;
    readonly onClose?: () => void;
    readonly onSearch?: (query: string) => void;
    readonly onInvite?: () => void;
    readonly onPublicInvite?: () => void;
}

const FIELD = '#6F6555';
const GRAY = '#837A91';

export const AllianceInvitePanel = defineComponent<AllianceInvitePanelProps>((p) => {
    const [query, setQuery] = useState('');
    const search = () => {
        p.onSearch?.(query);
    };
    return (
        <view name="AllianceInvite" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <view name="AllianceInvite/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
            <view name="AllianceInvite/Window"
                style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
                <PopupBackground kind="prompt" />
                <text value={p.title ?? '邀请成员'}
                    style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58,
                        font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                        outlineColor: '#593D84', outlineWidth: 2,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <CloseButton onClick={p.onClose} />

                <image source={imageRef('ui/alliance/input-bg')}
                    style={{ position: 'absolute', left: 15, top: 106, width: 596, height: 54, sizeMode: 'sliced' }} />
                <input value={query} placeholder="" onInput={setQuery}
                    style={{ position: 'absolute', left: 15, top: 106, width: 596, height: 54,
                        fontSize: 26, color: FIELD, textAlign: 'center' }} />
                <text visible={query === ''} value={p.placeholder ?? '点击此处输入想要搜索的玩家'}
                    style={{ position: 'absolute', left: 15, top: 106, width: 596, height: 54,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: FIELD, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <view name="AllianceInvite/Search" interaction="press" onClick={search}
                    style={{ position: 'absolute', left: 622, top: 96, width: 69, height: 76 }}>
                    <image source={imageRef('ui/alliance/invite-search')} style={{ width: 69, height: 76 }} />
                </view>

                <image source={imageRef('ui/backpack/empty')}
                    style={{ position: 'absolute', left: 300, top: 428, width: 108, height: 116 }} />
                <text value={p.emptyText ?? '找不到符合条件的玩家'}
                    style={{ position: 'absolute', left: 12, top: 583, width: 684, height: 40,
                        font: fontRef('fonts/regular', 700), fontSize: 40, color: GRAY, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

                <view style={{ position: 'absolute', left: 56, top: 850, width: 255, height: 102 }}>
                    <ConfirmButton label={p.inviteLabel ?? '邀请'} onClick={p.onInvite} />
                </view>
                <view style={{ position: 'absolute', left: 397, top: 850, width: 255, height: 102 }}>
                    <ConfirmButton label={p.publicLabel ?? '公开邀请'} onClick={p.onPublicInvite} />
                </view>
            </view>
        </view>
    );
});
