import { defineView } from '@uniflex/compiler';
import { AllianceAnnouncePanel, type AllianceAnnouncePanelProps } from './AllianceAnnouncePanel';

export type AllianceAnnounceParams = Omit<AllianceAnnouncePanelProps, 'visible'>;

export const AllianceAnnounce = defineView<AllianceAnnounceParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceAnnouncePage" style={{ width: 750, height: 1624 }}>
            <AllianceAnnouncePanel title={params.title} welcome={params.welcome} note={params.note}
                onClose={params.onClose} />
        </view>
    );
});
