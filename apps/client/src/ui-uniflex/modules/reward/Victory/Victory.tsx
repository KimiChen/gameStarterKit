import { defineView } from '@uniflex/compiler';
import { VictoryPanel, type VictoryPanelProps } from './VictoryPanel';

export type VictoryParams = VictoryPanelProps;

export const Victory = defineView<VictoryParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const result = params.result;
    const rewardTitle = params.rewardTitle;
    const hint = params.hint;
    const leftProgress = params.leftProgress;
    const rightProgress = params.rightProgress;
    const onClose = params.onClose;
    return (
        <view name="VictoryPage" style={{ width: 750, height: 1624 }}>
            <VictoryPanel result={result} rewardTitle={rewardTitle} hint={hint}
                leftProgress={leftProgress} rightProgress={rightProgress} onClose={onClose} />
        </view>
    );
});
