import { defineView } from '@uniflex/compiler';
import { AllianceAnnouncePanel, type AllianceAnnouncePanelProps } from '../../restored/pages/AllianceAnnounce/AllianceAnnouncePanel';

export type AllianceAnnounceRestoredParams = Omit<AllianceAnnouncePanelProps, 'visible'>;

export const AllianceAnnounceRestored = defineView<AllianceAnnounceRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceAnnouncePage" style={{ width: 750, height: 1624 }}>
            <AllianceAnnouncePanel title={params.title} welcome={params.welcome} note={params.note}
                onClose={params.onClose} />
        </view>
    );
});
