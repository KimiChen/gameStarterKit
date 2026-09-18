import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface AllianceBoardMessagePanelProps {
    readonly visible?: boolean;
    readonly placeholder?: string;
    readonly onSend?: (text: string) => void;
    readonly onAction?: (id: string) => void;
}

const PLACEHOLDER = '#9684B2';
const FIELD = '#ffffff';

export const AllianceBoardMessagePanel = defineComponent<AllianceBoardMessagePanelProps>((p) => {
    const [draft, setDraft] = useState('');
    const send = () => {
        p.onSend?.(draft);
        p.onAction?.('send_message');
        setDraft('');
    };
    return (
        <view name="AllianceBoardMessage" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, bottom: 0, width: 750, height: 110 }}>
            <image source={imageRef('ui/alliance/board-input')}
                style={{ position: 'absolute', left: 102, top: 20, width: 483, height: 62, sizeMode: 'sliced' }} />
            <input value={draft} placeholder="" onInput={setDraft}
                style={{ position: 'absolute', left: 113, top: 20, width: 400, height: 62,
                    fontSize: 26, color: FIELD, textAlign: 'left' }} />
            <text visible={draft === ''} value={p.placeholder ?? '再次输入内容...'}
                style={{ position: 'absolute', left: 113, top: 20, width: 400, height: 62,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: PLACEHOLDER, bold: true,
                    verticalAlign: 'center' }} />
            <view name="AllianceBoard/Emoji" interaction="press" onClick={() => p.onAction?.('open_emoji')}
                style={{ position: 'absolute', left: 521, top: 21, width: 59, height: 60 }}>
                <image source={imageRef('ui/alliance/board-emoji')} style={{ width: 59, height: 60 }} />
            </view>
            <view name="AllianceBoard/Send" interaction="press" onClick={send}
                style={{ position: 'absolute', left: 589, top: 14, width: 154, height: 77 }}>
                <image source={imageRef('ui/alliance/board-send')} style={{ width: 154, height: 77 }} />
            </view>
        </view>
    );
});
