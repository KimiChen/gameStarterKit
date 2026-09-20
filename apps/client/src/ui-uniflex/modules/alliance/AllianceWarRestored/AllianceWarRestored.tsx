import { defineView } from '@uniflex/compiler';
import { AllianceWarPanel, type AllianceWarPanelProps } from '../AllianceWar/AllianceWarPanel';

export type AllianceWarRestoredParams = Omit<AllianceWarPanelProps, 'visible'>;

export const AllianceWarRestored = defineView<AllianceWarRestoredParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceWarPage" style={{ width: 750, height: 1624 }}>
            <AllianceWarPanel title={params.title} tab={params.tab}
                onBack={params.onBack} onAction={params.onAction} onSelectTab={params.onSelectTab} />
        </view>
    );
});
