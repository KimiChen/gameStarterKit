import { defineView } from '@uniflex/compiler';
import { AllianceTechPanel, type AllianceTechPanelProps } from './AllianceTechPanel';

export type AllianceTechRestoredParams = Omit<AllianceTechPanelProps, 'visible'>;

export const AllianceTechRestored = defineView<AllianceTechRestoredParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceTechPage" style={{ width: 750, height: 1624 }}>
            <AllianceTechPanel title={params.title} rankLabel={params.rankLabel}
                nodes={params.nodes} onBack={params.onBack} onAction={params.onAction} />
        </view>
    );
});
