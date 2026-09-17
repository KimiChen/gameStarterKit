import { defineView } from '@uniflex/compiler';
import { AllianceCreatePanel, type AllianceCreatePanelProps } from '../AllianceCreate/AllianceCreatePanel';

export type AllianceCreateRestoredParams = Omit<AllianceCreatePanelProps, 'visible'>;

export const AllianceCreateRestored = defineView<AllianceCreateRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceCreatePage" style={{ width: 750, height: 1624 }}>
            <AllianceCreatePanel title={params.title} cost={params.cost}
                onClose={params.onClose} onCreate={params.onCreate} onChangeBanner={params.onChangeBanner} />
        </view>
    );
});
