import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { PopupFrame } from '../../../components/popup/PopupFrame';

export interface AllianceAnnouncePanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly welcome?: string;
    readonly note?: string;
    readonly onClose?: () => void;
}

const GRAY = '#837A91';
const RED = '#EF4B4B';
const LINE = 34;
const BODY_LEFT = 28;
const BODY_WIDTH = 660;

export const AllianceAnnouncePanel = defineComponent<AllianceAnnouncePanelProps>((p) => (
    <view name="AllianceAnnounce" visible={p.visible !== false}
        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
        <PopupFrame title={p.title ?? '联盟公告'} kind="prompt" left={21} top={318} width={708} height={912}
            onClose={p.onClose} />
        <view style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 912 }}>
            <image source={imageRef('ui/alliance/announce-panel')}
                style={{ position: 'absolute', left: 12, top: 99, width: 683, height: 674, sizeMode: 'sliced' }} />
            <text value={p.welcome ?? '欢迎加入联盟~努力发展联盟，让我们变得更强大！'}
                style={{ position: 'absolute', left: BODY_LEFT, top: 125, width: BODY_WIDTH, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="-----------------------------------------------------"
                style={{ position: 'absolute', left: BODY_LEFT, top: 159, width: BODY_WIDTH, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true }} />
            <text value="1. 升级科技：每日捐献联盟科技，可使联盟快速发展。"
                style={{ position: 'absolute', left: BODY_LEFT, top: 193, width: BODY_WIDTH, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="1. 升级科技"
                style={{ position: 'absolute', left: BODY_LEFT, top: 193, width: 180, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: RED, bold: true }} />
            <text value={"2. 集结章鱼王：发起集结章鱼王可获得丰厚奖励，快速提高战\n力。"}
                style={{ position: 'absolute', left: BODY_LEFT, top: 227, width: BODY_WIDTH, height: 68,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="2. 集结章鱼王"
                style={{ position: 'absolute', left: BODY_LEFT, top: 227, width: 200, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: RED, bold: true }} />
            <text value="3.参与集结：在战争界面中打开自动集结，每天有 50 次参与奖励。"
                style={{ position: 'absolute', left: BODY_LEFT, top: 295, width: BODY_WIDTH, height: 68,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="3.参与集结"
                style={{ position: 'absolute', left: BODY_LEFT, top: 295, width: 180, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: RED, bold: true }} />
            <text value="4. 扩大领地：在领地界面可以建造联盟堡垒、联盟旗帜扩大领地范围。"
                style={{ position: 'absolute', left: BODY_LEFT, top: 363, width: BODY_WIDTH, height: 68,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="4. 扩大领地"
                style={{ position: 'absolute', left: BODY_LEFT, top: 363, width: 180, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: RED, bold: true }} />
            <text value="5.联盟属性：占领港口、争夺要塞，全联盟可获得大量属性加成。"
                style={{ position: 'absolute', left: BODY_LEFT, top: 431, width: BODY_WIDTH, height: 68,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <text value="5.联盟属性"
                style={{ position: 'absolute', left: BODY_LEFT, top: 431, width: 180, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: RED, bold: true }} />
            <text value="------------------------------------------------------"
                style={{ position: 'absolute', left: BODY_LEFT, top: 499, width: BODY_WIDTH, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true }} />
            <text value={p.note ?? '注：R4 成员可以在领地界面，选中联盟建筑开启修建，所有联盟成员均可派遣部队前往正在修建'}
                style={{ position: 'absolute', left: BODY_LEFT, top: 533, width: BODY_WIDTH, height: 68,
                    font: fontRef('fonts/regular', 700), fontSize: 24, lineHeight: LINE, color: GRAY, bold: true, wrap: true }} />
            <view style={{ position: 'absolute', left: 227, top: 789, width: 255, height: 102 }}>
                <ConfirmButton label="确定" onClick={p.onClose} />
            </view>
        </view>
    </view>
));
