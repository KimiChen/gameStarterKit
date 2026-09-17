import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../components/popup/PopupFrame';
import { AllianceMemberSettingsRow } from './AllianceMemberSettingsRow';

export interface AllianceMemberSettingsPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly desc?: string;
    readonly r2Power?: string;
    readonly r3Power?: string;
    readonly r2Enabled?: boolean;
    readonly r3Enabled?: boolean;
    readonly onClose?: () => void;
    readonly onToggleR2?: (enabled: boolean) => void;
    readonly onToggleR3?: (enabled: boolean) => void;
}

const TITLE = '#3F3254';
const META = '#837A91';
const DESC = '开启后，玩家战力达到指定条件后，会自动晋升阶级，最高晋升至R 3级。';

export const AllianceMemberSettingsPanel = defineComponent<AllianceMemberSettingsPanelProps>((p) => {
    const [r2, setR2] = useState(p.r2Enabled !== false);
    const [r3, setR3] = useState(p.r3Enabled !== false);
    const toggleR2 = () => {
        const next = r2 !== true;
        setR2(next);
        p.onToggleR2?.(next);
    };
    const toggleR3 = () => {
        const next = r3 !== true;
        setR3(next);
        p.onToggleR3?.(next);
    };
    return (
        <view name="AllianceMemberSettings" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '成员设置'} kind="prompt" left={21} top={318} width={708} height={992}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
                <image source={imageRef('ui/alliance/mset-card')}
                    style={{ position: 'absolute', left: 13, top: 107, width: 685, height: 292, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/alliance/mset-header')}
                    style={{ position: 'absolute', left: 16, top: 110, width: 679, height: 55, sizeMode: 'sliced' }} />
                <text value="自动晋升"
                    style={{ position: 'absolute', left: 16, top: 110, width: 679, height: 55,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: TITLE, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={p.desc ?? DESC}
                    style={{ position: 'absolute', left: 24, top: 170, width: 660, height: 60,
                        font: fontRef('fonts/regular', 700), fontSize: 22, lineHeight: 30, color: META, bold: true, wrap: true }} />
                <AllianceMemberSettingsRow label="R2自动晋升战力要求" power={p.r2Power ?? '500M'}
                    checked={r2} fistTop={239} powerLeft={456} powerTop={248} checkTop={248} labelTop={256}
                    onToggle={toggleR2} />
                <AllianceMemberSettingsRow label="R3自动晋升战力要求" power={p.r3Power ?? '500M'}
                    checked={r3} fistTop={294} powerLeft={454} powerTop={301} checkTop={303} labelTop={311}
                    onToggle={toggleR3} />
                <text value="开启自动晋升后，可自主设置晋升条件"
                    style={{ position: 'absolute', left: 50, top: 364, width: 608, height: 24,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: META, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    );
});
