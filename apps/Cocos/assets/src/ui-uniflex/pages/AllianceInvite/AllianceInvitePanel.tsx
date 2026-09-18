import { defineComponent, useState } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { EmptyState } from '../../components/empty/EmptyState';
import { InputText } from '../../components/input/InputText';
import { PopupFrame } from '../../components/popup/PopupFrame';

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

export const AllianceInvitePanel = defineComponent<AllianceInvitePanelProps>((p) => {
    const [query, setQuery] = useState('');
    const search = () => {
        p.onSearch?.(query);
    };
    const inputBg = imageRef('ui/alliance/input-bg');
    const emptyIcon = imageRef('ui/backpack/empty');
    const placeholder = p.placeholder ?? '点击此处输入想要搜索的玩家';
    const emptyText = p.emptyText ?? '找不到符合条件的玩家';
    return (
        <view name="AllianceInvite" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '邀请成员'} kind="prompt" left={21} top={318} width={708} height={992}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
                <InputText background={inputBg} left={15} top={106} width={596} height={54}
                    value={query} onInput={setQuery} placeholder={placeholder} />
                <view name="AllianceInvite/Search" interaction="press" onClick={search}
                    style={{ position: 'absolute', left: 622, top: 96, width: 69, height: 76 }}>
                    <image source={imageRef('ui/alliance/invite-search')} style={{ width: 69, height: 76 }} />
                </view>

                <EmptyState icon={emptyIcon} left={300} top={428} label={emptyText}
                    labelLeft={12} labelTop={583} labelWidth={684} />

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
