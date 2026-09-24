import { defineView } from '@uniflex/compiler';
import { MailBattleLogPanel, type MailBattleLogPanelProps } from './MailBattleLogPanel';

export type MailBattleLogParams = Omit<MailBattleLogPanelProps, 'visible'>;
export const MailBattleLog = defineView<MailBattleLogParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return <view name="MailBattleLog" style={{ width: 750, height: 1624 }}>
        <MailBattleLogPanel timestamp={params.timestamp} rounds={params.rounds} onClose={params.onClose} onAction={params.onAction} />
    </view>;
});
