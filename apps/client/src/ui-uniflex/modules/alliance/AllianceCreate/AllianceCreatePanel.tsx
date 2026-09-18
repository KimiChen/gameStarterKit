import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { InputText } from '../../../components/input/InputText';
import { PopupFrame } from '../../../components/popup/PopupFrame';

export interface AllianceCreatePanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly cost?: string;
    readonly onClose?: () => void;
    readonly onCreate?: () => void;
    readonly onChangeBanner?: () => void;
}

const LABEL = '#59496E';
const FIELD = '#6F6555';

export const AllianceCreatePanel = defineComponent<AllianceCreatePanelProps>((p) => {
    const [shortName, setShortName] = useState('');
    const [fullName, setFullName] = useState('');
    const [level, setLevel] = useState(0);
    const minusLevel = () => {
        if (level > 0) setLevel(level - 1);
    };
    const plusLevel = () => setLevel(level + 1);
    const inputBg = imageRef('ui/alliance/input-bg');
    return (
        <view name="AllianceCreate" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '创建联盟'} left={21} top={318} width={708} height={992}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
                <image source={imageRef('ui/alliance/nation-flag')}
                    style={{ position: 'absolute', left: 611, top: 99, width: 67, height: 43 }} />
                <image source={imageRef('ui/alliance/flag')}
                    style={{ position: 'absolute', left: 255, top: 132, width: 198, height: 178 }} />
                <view name="AllianceCreate/Swap" interaction="press" onClick={() => p.onChangeBanner?.()}
                    style={{ position: 'absolute', left: 418, top: 264, width: 61, height: 66 }}>
                    <image source={imageRef('ui/alliance/flag-swap')} style={{ width: 61, height: 66 }} />
                </view>

                <text value="联盟简称"
                    style={{ position: 'absolute', left: 31, top: 368, width: 160, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <InputText background={inputBg} left={23} top={400} width={663} height={64}
                    value={shortName} onInput={setShortName} maxLength={4}
                    placeholder="请输入简称，3-4字符" />

                <text value="联盟名称"
                    style={{ position: 'absolute', left: 31, top: 479, width: 160, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <InputText background={inputBg} left={23} top={511} width={663} height={64}
                    value={fullName} onInput={setFullName} maxLength={15}
                    placeholder="请输入全称，最多15个字符" />

                <text value="需要等级"
                    style={{ position: 'absolute', left: 32, top: 590, width: 160, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <view name="AllianceCreate/Minus" interaction="press" onClick={minusLevel}
                    style={{ position: 'absolute', left: 16, top: 621, width: 68, height: 77 }}>
                    <image source={imageRef('ui/backpack/button-minus')} style={{ width: 68, height: 77 }} />
                </view>
                <image source={imageRef('ui/alliance/input-bg')}
                    style={{ position: 'absolute', left: 93, top: 627, width: 523, height: 64, sizeMode: 'sliced' }} />
                <text value={String(level)}
                    style={{ position: 'absolute', left: 93, top: 627, width: 523, height: 64,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: FIELD, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <view name="AllianceCreate/Plus" interaction="press" onClick={plusLevel}
                    style={{ position: 'absolute', left: 625, top: 621, width: 69, height: 77 }}>
                    <image source={imageRef('ui/backpack/button-plus')} style={{ width: 69, height: 77 }} />
                </view>

                <image source={imageRef('ui/alliance/create-diamond')}
                    style={{ position: 'absolute', left: 270, top: 805, width: 46, height: 38 }} />
                <text value={p.cost ?? '5000'}
                    style={{ position: 'absolute', left: 325, top: 805, width: 90, height: 38,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <view style={{ position: 'absolute', left: 227, top: 850, width: 255, height: 102 }}>
                    <ConfirmButton label="创建" onClick={p.onCreate} />
                </view>
            </view>
        </view>
    );
});
