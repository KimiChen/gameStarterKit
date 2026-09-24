import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { ItemSlot } from '../../../gamecomponents/item/ItemSlot';

export interface VictoryPanelProps {
    readonly result?: string;
    readonly rewardTitle?: string;
    readonly hint?: string;
    readonly leftProgress?: string;
    readonly rightProgress?: string;
    readonly onClose?: () => void;
}

const BODY_FONT = fontRef('fonts/regular', 700);
const SCENE = imageRef('ui/victory/scene');
const SUNSET = imageRef('ui/victory/sunset');
const RAYS = imageRef('ui/victory/rays');
const EMBLEM = imageRef('ui/victory/emblem');
const RIBBON = imageRef('ui/victory/ribbon');
const VS = imageRef('ui/victory/vs');
const FRAME = imageRef('ui/victory/portrait-frame');
const PLATE = imageRef('ui/victory/portrait-plate');
const BLUE = imageRef('ui/victory/portrait-blue');
const RED = imageRef('ui/victory/portrait-red');
const TRACK = imageRef('ui/victory/bar-track');
const FILL_GREEN = imageRef('ui/victory/bar-fill-green');
const FILL_RED = imageRef('ui/victory/bar-fill-red');
const BANNER = imageRef('ui/victory/reward-banner');
const TITLE = imageRef('ui/victory/title');

/** 750×1624 battle victory. Item frames come from ItemSlot at 0.8. */
export const VictoryPanel = defineComponent<VictoryPanelProps>((p) => {
    const result = p.result ?? '可喜可贺，战斗胜利';
    const rewardTitle = p.rewardTitle ?? '获得奖励';
    const hint = p.hint ?? '点击空白区域关闭';
    const leftProgress = p.leftProgress ?? '120/500';
    const rightProgress = p.rightProgress ?? '120/500';
    const onClose = p.onClose;
    return (
        <view name="Victory"
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image name="Victory/Scene" source={SCENE}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view name="Victory/Mask" interaction="press" onClick={onClose}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#000000cc' }} />
            <image name="Victory/Banner" source={BANNER}
                style={{ position: 'absolute', left: 83, top: 986, width: 603, height: 52 }} />
            <text name="Victory/RewardTitle" value={rewardTitle}
                style={{ position: 'absolute', left: 83, top: 996, width: 603, height: 29,
                    font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <ItemSlot left={137} top={1113} itemId="egg" count="99" scale={0.8} />
            <ItemSlot left={313} top={1113} itemId="victory-axe" count="99" scale={0.8} />
            <ItemSlot left={489} top={1113} itemId="victory-cube" count="99" scale={0.8} />
            <text name="Victory/Hint" value={hint}
                style={{ position: 'absolute', left: 0, top: 1354, width: 750, height: 26,
                    font: BODY_FONT, fontSize: 26, color: '#837A91', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="Victory/LeftFrame" source={FRAME}
                style={{ position: 'absolute', left: 108, top: 730, width: 134, height: 137 }} />
            <image name="Victory/LeftPlate" source={PLATE}
                style={{ position: 'absolute', left: 113, top: 735, width: 124, height: 124 }} />
            <image name="Victory/LeftAvatar" source={BLUE}
                style={{ position: 'absolute', left: 113, top: 738, width: 124, height: 121 }} />
            <image name="Victory/RightFrame" source={FRAME}
                style={{ position: 'absolute', left: 509, top: 730, width: 134, height: 137 }} />
            <image name="Victory/RightPlate" source={PLATE}
                style={{ position: 'absolute', left: 514, top: 735, width: 124, height: 124 }} />
            <image name="Victory/RightAvatar" source={RED}
                style={{ position: 'absolute', left: 514, top: 735, width: 124, height: 124 }} />
            <ProgressBar left={87} top={877} width={171} height={29}
                track={TRACK} fill={FILL_GREEN} fillWidth={97}
                label={leftProgress} labelSize={22} />
            <ProgressBar left={489} top={877} width={171} height={29}
                track={TRACK} fill={FILL_RED} fillWidth={97}
                label={rightProgress} labelSize={22} />
            <text name="Victory/Result" value={result}
                style={{ position: 'absolute', left: 0, top: 936, width: 750, height: 27,
                    font: BODY_FONT, fontSize: 26, color: '#FFFFFF', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="Victory/Vs" source={VS}
                style={{ position: 'absolute', left: 319, top: 756, width: 113, height: 101 }} />
            <image name="Victory/Sunset" source={SUNSET}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 579 }} />
            <image name="Victory/Rays" source={RAYS}
                style={{ position: 'absolute', left: 101, top: 120, width: 553, height: 471 }} />
            <image name="Victory/Emblem" source={EMBLEM}
                style={{ position: 'absolute', left: 169, top: 270, width: 418, height: 303 }} />
            <image name="Victory/Ribbon" source={RIBBON}
                style={{ position: 'absolute', left: 111, top: 496, width: 536, height: 118 }} />
            <image name="Victory/Title" source={TITLE}
                style={{ position: 'absolute', left: 179, top: 480, width: 396, height: 111 }} />
        </view>
    );
});
