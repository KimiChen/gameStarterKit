import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { StrengthenWay } from '../../../gamecomponents/strengthen/StrengthenWay';

export interface DefeatPanelProps {
    readonly result?: string;
    readonly sectionTitle?: string;
    readonly hint?: string;
    readonly leftProgress?: string;
    readonly rightProgress?: string;
    readonly onClose?: () => void;
    readonly onWay?: (id: string) => void;
}

const BODY_FONT = fontRef('fonts/regular', 700);
const SCENE = imageRef('ui/victory/scene');
const SUNSET = imageRef('ui/defeat/sunset');
const EMBLEM = imageRef('ui/defeat/emblem');
const RIBBON = imageRef('ui/defeat/ribbon');
const VS = imageRef('ui/defeat/vs');
const FRAME = imageRef('ui/victory/portrait-frame');
const PLATE = imageRef('ui/victory/portrait-plate');
const BLUE = imageRef('ui/victory/portrait-blue');
const RED = imageRef('ui/victory/portrait-red');
const TRACK = imageRef('ui/victory/bar-track');
const FILL_GREEN = imageRef('ui/victory/bar-fill-green');
const FILL_RED = imageRef('ui/victory/bar-fill-red');
const BANNER = imageRef('ui/victory/reward-banner');
const TITLE = imageRef('ui/defeat/title');

/** 750×1624 battle defeat. Shared scene, portraits and bars come from Victory. */
export const DefeatPanel = defineComponent<DefeatPanelProps>((p) => {
    const result = p.result ?? '真是遗憾！';
    const sectionTitle = p.sectionTitle ?? '变强途径';
    const hint = p.hint ?? '点击空白区域关闭';
    const leftProgress = p.leftProgress ?? '120/500';
    const rightProgress = p.rightProgress ?? '120/500';
    const onClose = p.onClose;
    const onWay = p.onWay;
    const openSkill = () => onWay?.('skill');
    const openTrain = () => onWay?.('train');
    const openForge = () => onWay?.('forge');
    const openRecruit = () => onWay?.('recruit');
    return (
        <view name="Defeat"
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image name="Defeat/Scene" source={SCENE}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view name="Defeat/Mask" interaction="press" onClick={onClose}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#000000cc' }} />
            <image name="Defeat/Banner" source={BANNER}
                style={{ position: 'absolute', left: 83, top: 986, width: 603, height: 52 }} />
            <text name="Defeat/Section" value={sectionTitle}
                style={{ position: 'absolute', left: 83, top: 995, width: 603, height: 30,
                    font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <StrengthenWay left={96} top={1069} wayId="skill" onClick={openSkill} />
            <StrengthenWay left={240} top={1069} wayId="train" onClick={openTrain} />
            <StrengthenWay left={385} top={1069} wayId="forge" onClick={openForge} />
            <StrengthenWay left={529} top={1069} wayId="recruit" onClick={openRecruit} />
            <text name="Defeat/Hint" value={hint}
                style={{ position: 'absolute', left: 0, top: 1354, width: 750, height: 26,
                    font: BODY_FONT, fontSize: 26, color: '#837A91', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="Defeat/LeftFrame" source={FRAME}
                style={{ position: 'absolute', left: 108, top: 730, width: 134, height: 137 }} />
            <image name="Defeat/LeftPlate" source={PLATE}
                style={{ position: 'absolute', left: 113, top: 735, width: 124, height: 124 }} />
            <image name="Defeat/LeftAvatar" source={BLUE}
                style={{ position: 'absolute', left: 113, top: 738, width: 124, height: 121 }} />
            <image name="Defeat/RightFrame" source={FRAME}
                style={{ position: 'absolute', left: 509, top: 730, width: 134, height: 137 }} />
            <image name="Defeat/RightPlate" source={PLATE}
                style={{ position: 'absolute', left: 514, top: 735, width: 124, height: 124 }} />
            <image name="Defeat/RightAvatar" source={RED}
                style={{ position: 'absolute', left: 514, top: 735, width: 124, height: 124 }} />
            <ProgressBar left={87} top={877} width={171} height={29}
                track={TRACK} fill={FILL_GREEN} fillWidth={97}
                label={leftProgress} labelSize={22} />
            <ProgressBar left={489} top={877} width={171} height={29}
                track={TRACK} fill={FILL_RED} fillWidth={97}
                label={rightProgress} labelSize={22} />
            <text name="Defeat/Result" value={result}
                style={{ position: 'absolute', left: 0, top: 936, width: 750, height: 26,
                    font: BODY_FONT, fontSize: 26, color: '#FFFFFF', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="Defeat/Vs" source={VS}
                style={{ position: 'absolute', left: 317, top: 753, width: 117, height: 106 }} />
            <image name="Defeat/Sunset" source={SUNSET}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 579 }} />
            <image name="Defeat/Emblem" source={EMBLEM}
                style={{ position: 'absolute', left: 177, top: 270, width: 407, height: 303 }} />
            <image name="Defeat/Ribbon" source={RIBBON}
                style={{ position: 'absolute', left: 111, top: 496, width: 536, height: 118 }} />
            <image name="Defeat/Title" source={TITLE}
                style={{ position: 'absolute', left: 179, top: 480, width: 400, height: 111 }} />
        </view>
    );
});
