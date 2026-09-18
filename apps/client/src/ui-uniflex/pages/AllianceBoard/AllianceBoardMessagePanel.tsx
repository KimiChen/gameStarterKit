import { defineComponent, useState } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';
import { InputText } from '../../components/input/InputText';

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
    const inputBg = imageRef('ui/alliance/board-input');
    const placeholder = p.placeholder ?? '再次输入内容...';
    return (
        <view name="AllianceBoardMessage" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, bottom: 0, width: 750, height: 110 }}>
            <InputText background={inputBg} left={102} top={20} width={483} height={62}
                value={draft} onInput={setDraft} placeholder={placeholder}
                color={FIELD} placeholderColor={PLACEHOLDER} textAlign="left"
                textLeft={11} textWidth={400} />
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
