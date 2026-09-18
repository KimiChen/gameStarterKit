import { defineComponent } from '@uniflex/compiler';
import { QuantityControl } from '../../../../components/quantity/QuantityControl';

export const BackpackQuantityControl = defineComponent<{
    readonly value: number;
    readonly max: number;
    readonly onDecrease?: () => void;
    readonly onIncrease?: () => void;
    readonly onChange?: (value: number) => void;
}>((p) => {
    const value = p.value;
    const max = p.max;
    const onChange = p.onChange;
    const onDecrease = p.onDecrease;
    const onIncrease = p.onIncrease;
    return (
        <view name="BackpackQuantityControl" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1225 }}>
            <QuantityControl left={25} top={1118} value={value} max={max}
                onChange={onChange} onDecrease={onDecrease} onIncrease={onIncrease} />
        </view>
    );
});
