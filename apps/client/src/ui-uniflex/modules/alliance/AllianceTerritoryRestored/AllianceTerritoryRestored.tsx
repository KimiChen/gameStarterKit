import { defineView } from '@uniflex/compiler';
import { AllianceTerritoryPanel, type AllianceTerritoryPanelProps } from '../AllianceTerritory/AllianceTerritoryPanel';

export type AllianceTerritoryRestoredParams = Omit<AllianceTerritoryPanelProps, 'visible'>;

export const AllianceTerritoryRestored = defineView<AllianceTerritoryRestoredParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceTerritoryPage" style={{ width: 750, height: 1624 }}>
            <AllianceTerritoryPanel title={params.title} tab={params.tab}
                onBack={params.onBack} onAction={params.onAction} onSelectTab={params.onSelectTab} />
        </view>
    );
});
