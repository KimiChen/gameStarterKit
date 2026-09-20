import { defineView } from '@uniflex/compiler';
import { AllianceMarchBoostPanel, type AllianceMarchBoostPanelProps } from '../AllianceMarchBoost/AllianceMarchBoostPanel';

export type AllianceMarchBoostRestoredParams = Omit<AllianceMarchBoostPanelProps, 'visible'>;

export const AllianceMarchBoostRestored = defineView<AllianceMarchBoostRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="AllianceMarchBoostPage" style={{ width: 750, height: 1624 }}>
            <AllianceMarchBoostPanel title={params.title} skillName={params.skillName}
                skillDesc={params.skillDesc} level={params.level}
                currentAttr={params.currentAttr} nextAttr={params.nextAttr}
                progressText={params.progressText} progressCurrent={params.progressCurrent}
                progressMax={params.progressMax} rewardGem={params.rewardGem}
                rewardLeaf={params.rewardLeaf} rewardTicket={params.rewardTicket}
                leftHint={params.leftHint} rightHint={params.rightHint}
                payGem={params.payGem} payCoin={params.payCoin}
                onClose={params.onClose} onPayGem={params.onPayGem} onPayCoin={params.onPayCoin} />
        </view>
    );
});
