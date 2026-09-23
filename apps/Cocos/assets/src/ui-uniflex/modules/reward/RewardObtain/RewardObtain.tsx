import { defineView } from '@uniflex/compiler';
import { RewardObtainPanel, type RewardObtainPanelProps } from './RewardObtainPanel';

export type RewardObtainParams = RewardObtainPanelProps;

export const RewardObtain = defineView<RewardObtainParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const title = params.title;
    const hint = params.hint;
    const rewards = params.rewards;
    const onClose = params.onClose;
    return (
        <view name="RewardObtainPage" style={{ width: 750, height: 1624 }}>
            <RewardObtainPanel title={title} hint={hint} rewards={rewards} onClose={onClose} />
        </view>
    );
});
