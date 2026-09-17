import { defineView, useState } from '@uniflex/compiler';
import { AllianceTechRestoredAllianceTechPage } from './components/AllianceTechRestoredAllianceTechPage';

export type AllianceTechRestoredAction = {
    readonly id: string;
    readonly action: 'back' | 'close' | 'tab' | 'primary' | 'select';
};
export interface AllianceTechRestoredParams {
    readonly onAction?: (action: AllianceTechRestoredAction) => void;
}

export const AllianceTechRestored = defineView<AllianceTechRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const [selected, setSelected] = useState<string | null>(null);
    const emit = (id: string, action: AllianceTechRestoredAction['action']) => {
        setSelected(id);
        context.params?.onAction?.({ id, action });
    };
    return (
        <view name="AllianceTechRestored" style={{ width: 750, height: 1624 }}>
            <AllianceTechRestoredAllianceTechPage selected={selected} emit={emit} />
        </view>
    );
});
