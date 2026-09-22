import { defineView } from '@uniflex/compiler';
import { AllianceMarchBoostPanel, type AllianceMarchBoostPanelProps } from '../AllianceMarchBoost/AllianceMarchBoostPanel';

export type AllianceMarchBoostRestoredParams = Omit<AllianceMarchBoostPanelProps, 'visible'>;

export const AllianceMarchBoostRestored = defineView<AllianceMarchBoostRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceMarchBoostPage" style={{ width: 750, height: 1624 }}>
            <AllianceMarchBoostPanel techId={params.techId} level={params.level}
                donate={params.donate} donateMax={params.donateMax}
                timesUsed={params.timesUsed} timesLimit={params.timesLimit}
                rewards={params.rewards} payGem={params.payGem} payCoin={params.payCoin}
                onClose={params.onClose} onPayGem={params.onPayGem} onPayCoin={params.onPayCoin} />
        </view>
    );
});
