import { defineView } from '@uniflex/compiler';
import { DefeatPanel, type DefeatPanelProps } from './DefeatPanel';

export type DefeatParams = DefeatPanelProps;

export const Defeat = defineView<DefeatParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const result = params.result;
    const sectionTitle = params.sectionTitle;
    const hint = params.hint;
    const leftProgress = params.leftProgress;
    const rightProgress = params.rightProgress;
    const onClose = params.onClose;
    const onWay = params.onWay;
    return (
        <view name="DefeatPage" style={{ width: 750, height: 1624 }}>
            <DefeatPanel result={result} sectionTitle={sectionTitle} hint={hint}
                leftProgress={leftProgress} rightProgress={rightProgress} onClose={onClose} onWay={onWay} />
        </view>
    );
});
