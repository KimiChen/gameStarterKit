import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface DefeatPanelProps {
    readonly title?: string;
    readonly result?: string;
    readonly sectionTitle?: string;
    readonly hint?: string;
    readonly leftProgress?: string;
    readonly rightProgress?: string;
    readonly onClose?: () => void;
    readonly onWay?: (id: string) => void;
}

const TITLE_FONT = fontRef('fonts/regular', 700);
const BODY_FONT = fontRef('fonts/regular', 700);
const SCENE = imageRef('ui/victory/scene');
const SUNSET = imageRef('ui/defeat/sunset');
const EMBLEM = imageRef('ui/defeat/emblem');
const RIBBON = imageRef('ui/defeat/ribbon');
const VS = imageRef('ui/defeat/vs');
const CIRCLE = imageRef('ui/defeat/way-circle');
const ICON_SKILL = imageRef('ui/defeat/icon-skill');
const ICON_TRAIN = imageRef('ui/defeat/icon-train');
const ICON_FORGE = imageRef('ui/defeat/icon-forge');
const ICON_RECRUIT = imageRef('ui/defeat/icon-recruit');
const FRAME = imageRef('ui/victory/portrait-frame');
const PLATE = imageRef('ui/victory/portrait-plate');
const BLUE = imageRef('ui/victory/portrait-blue');
const RED = imageRef('ui/victory/portrait-red');
const TRACK = imageRef('ui/victory/bar-track');
const FILL_GREEN = imageRef('ui/victory/bar-fill-green');
const FILL_RED = imageRef('ui/victory/bar-fill-red');
const BANNER = imageRef('ui/victory/reward-banner');

/** 750×1624 battle defeat. Shared scene, portraits and bars come from Victory. */
export const DefeatPanel = defineComponent<DefeatPanelProps>((p) => {
    const title = p.title ?? '战斗失败';
    const result = p.result ?? '真是遗憾！';
    const sectionTitle = p.sectionTitle ?? '变强途径';
    const hint = p.hint ?? '点击空白区域关闭';
    const leftProgress = p.leftProgress ?? '120/500';
    const rightProgress = p.rightProgress ?? '120/500';
    const skillLabel = '升级技能';
    const trainLabel = '前往历练';
    const forgeLabel = '装备锻造';
    const recruitLabel = '招募英雄';
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
            <view name="Defeat/WaySkill" interaction="press" onClick={openSkill}
                style={{ position: 'absolute', left: 96, top: 1069, width: 126, height: 162 }}>
                <image name="Defeat/SkillCircle" source={CIRCLE}
                    style={{ position: 'absolute', left: 0, top: 0, width: 126, height: 126 }} />
                <image name="Defeat/SkillIcon" source={ICON_SKILL}
                    style={{ position: 'absolute', left: 24, top: 20, width: 70, height: 86 }} />
                <text name="Defeat/SkillLabel" value={skillLabel}
                    style={{ position: 'absolute', left: -17, top: 132, width: 160, height: 30,
                        font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
            </view>
            <view name="Defeat/WayTrain" interaction="press" onClick={openTrain}
                style={{ position: 'absolute', left: 240, top: 1069, width: 126, height: 162 }}>
                <image name="Defeat/TrainCircle" source={CIRCLE}
                    style={{ position: 'absolute', left: 0, top: 0, width: 126, height: 126 }} />
                <image name="Defeat/TrainIcon" source={ICON_TRAIN}
                    style={{ position: 'absolute', left: 21, top: 24, width: 84, height: 83 }} />
                <text name="Defeat/TrainLabel" value={trainLabel}
                    style={{ position: 'absolute', left: -17, top: 132, width: 160, height: 30,
                        font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
            </view>
            <view name="Defeat/WayForge" interaction="press" onClick={openForge}
                style={{ position: 'absolute', left: 385, top: 1069, width: 126, height: 162 }}>
                <image name="Defeat/ForgeCircle" source={CIRCLE}
                    style={{ position: 'absolute', left: 0, top: 0, width: 126, height: 126 }} />
                <image name="Defeat/ForgeIcon" source={ICON_FORGE}
                    style={{ position: 'absolute', left: 21, top: 23, width: 81, height: 81 }} />
                <text name="Defeat/ForgeLabel" value={forgeLabel}
                    style={{ position: 'absolute', left: -17, top: 133, width: 160, height: 30,
                        font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
            </view>
            <view name="Defeat/WayRecruit" interaction="press" onClick={openRecruit}
                style={{ position: 'absolute', left: 529, top: 1069, width: 126, height: 162 }}>
                <image name="Defeat/RecruitCircle" source={CIRCLE}
                    style={{ position: 'absolute', left: 0, top: 0, width: 126, height: 126 }} />
                <image name="Defeat/RecruitIcon" source={ICON_RECRUIT}
                    style={{ position: 'absolute', left: 7, top: 17, width: 107, height: 86 }} />
                <text name="Defeat/RecruitLabel" value={recruitLabel}
                    style={{ position: 'absolute', left: -18, top: 133, width: 160, height: 30,
                        font: BODY_FONT, fontSize: 30, color: '#FFFFFF', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: false, overflow: 'shrink' }} />
            </view>
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
            <image name="Defeat/LeftTrack" source={TRACK}
                style={{ position: 'absolute', left: 87, top: 877, width: 171, height: 29, sizeMode: 'sliced' }} />
            <image name="Defeat/LeftFill" source={FILL_GREEN}
                style={{ position: 'absolute', left: 90, top: 879, width: 97, height: 25, sizeMode: 'sliced' }} />
            <text name="Defeat/LeftProgress" value={leftProgress}
                style={{ position: 'absolute', left: 87, top: 877, width: 171, height: 29,
                    font: BODY_FONT, fontSize: 22, color: '#FFFFFF', bold: true,
                    outlineColor: '#000000', outlineWidth: 2,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="Defeat/RightTrack" source={TRACK}
                style={{ position: 'absolute', left: 489, top: 877, width: 171, height: 29, sizeMode: 'sliced' }} />
            <image name="Defeat/RightFill" source={FILL_RED}
                style={{ position: 'absolute', left: 492, top: 879, width: 97, height: 25, sizeMode: 'sliced' }} />
            <text name="Defeat/RightProgress" value={rightProgress}
                style={{ position: 'absolute', left: 489, top: 877, width: 171, height: 29,
                    font: BODY_FONT, fontSize: 22, color: '#FFFFFF', bold: true,
                    outlineColor: '#000000', outlineWidth: 2,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
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
            <text name="Defeat/TitleShadow" value={title}
                style={{ position: 'absolute', left: 0, top: 489, width: 750, height: 111,
                    font: TITLE_FONT, fontSize: 100, color: '#242D3C', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <text name="Defeat/Title" value={title}
                style={{ position: 'absolute', left: 0, top: 480, width: 750, height: 111,
                    font: TITLE_FONT, fontSize: 100, color: '#DBE4FB', bold: true,
                    outlineColor: '#000000', outlineWidth: 4,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
