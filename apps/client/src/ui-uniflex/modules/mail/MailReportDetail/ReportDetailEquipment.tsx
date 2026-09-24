import { defineComponent, For } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';
import { ReportDetailCard, ReportDetailSectionHeading } from './ReportDetailChrome';
import { ReportDetailSlots } from './ReportDetailSlots';

interface EquipmentOwner { readonly id: string; readonly left: number; readonly top: number; readonly name: string; readonly portrait: ImageRef; readonly right: boolean; }
const owners: readonly EquipmentOwner[] = [
    { id: 'will', left: 18, top: 61, name: '维尔', portrait: imageRef('ui/mail-report-detail/face-blonde'), right: false },
    { id: 'red', left: 360, top: 61, name: '红毛', portrait: imageRef('ui/mail-report-detail/face-skull'), right: true },
    { id: 'hero', left: 18, top: 277, name: '候机', portrait: imageRef('ui/mail-report-detail/face-brown'), right: false },
    { id: 'anna', left: 360, top: 277, name: '安娜', portrait: imageRef('ui/mail-report-detail/face-red'), right: true },
    { id: 'sangis', left: 360, top: 493, name: '桑吉斯', portrait: imageRef('ui/mail-report-detail/face-bandit'), right: true },
];

export const ReportDetailEquipment = defineComponent<{ readonly visible: boolean }>((p) => (
    <view name="ReportDetailEquipment" visible={p.visible} style={{ position: 'absolute', width: 673, height: 727 }}>
        <ReportDetailCard height={711} />
        <ReportDetailSectionHeading title="装备对比" />
        <For each={owners} key="id">{(owner) => <ReportDetailEquipmentOwner owner={owner} />}</For>
    </view>
));

export const ReportDetailEquipmentOwner = defineComponent<{ readonly owner: EquipmentOwner }>((p) => {
    const owner = p.owner;
    const left = owner.left;
    const top = owner.top;
    const portraitLeft = owner.right ? 196 : 0;
    const nameLeft = owner.right ? 0 : 99;
    const align = owner.right ? 'right' : 'left';
    return <view name="ReportDetailEquipmentOwner" style={{ position: 'absolute', left: left, top: top, width: 291, height: 191 }}>
        <image source={owner.portrait} style={{ position: 'absolute', left: portraitLeft, width: 95, height: 97 }} />
        <text value={owner.name} style={{ position: 'absolute', left: nameLeft, top: 29, width: 190, height: 44, font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254', horizontalAlign: align }} />
        <image source={imageRef('ui/mail-report-detail/line')} style={{ position: 'absolute', left: 2, top: 108, width: 268, height: 3 }} />
        <ReportDetailSlots left={1} top={122} />
    </view>;
});
