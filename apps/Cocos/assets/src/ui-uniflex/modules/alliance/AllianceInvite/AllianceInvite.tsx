import { defineView } from '@uniflex/compiler';
import { AllianceInvitePanel, type AllianceInvitePanelProps } from './AllianceInvitePanel';

export type AllianceInviteParams = Omit<AllianceInvitePanelProps, 'visible'>;

export const AllianceInvite = defineView<AllianceInviteParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceInvitePage" style={{ width: 750, height: 1624 }}>
            <AllianceInvitePanel title={params.title} placeholder={params.placeholder}
                emptyText={params.emptyText} inviteLabel={params.inviteLabel}
                publicLabel={params.publicLabel} onClose={params.onClose}
                onSearch={params.onSearch} onInvite={params.onInvite}
                onPublicInvite={params.onPublicInvite} />
        </view>
    );
});
