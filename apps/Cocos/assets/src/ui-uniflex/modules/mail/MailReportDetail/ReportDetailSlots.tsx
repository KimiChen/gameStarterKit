import { defineComponent, For } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';

interface Slot { readonly id: string; readonly x: number; readonly icon: ImageRef; readonly w: number; readonly h: number; }
const shipSkills: readonly Slot[] = [
    { id: 'ship', x: 0, icon: imageRef('ui/mail-report-detail/skill-ship'), w: 47, h: 49 },
    { id: 'cannon', x: 75, icon: imageRef('ui/mail-report-detail/skill-cannon'), w: 56, h: 47 },
    { id: 'gear', x: 148, icon: imageRef('ui/mail-report-detail/skill-gear'), w: 49, h: 48 },
    { id: 'sail', x: 223, icon: imageRef('ui/mail-report-detail/skill-sail'), w: 58, h: 43 },
];
const equipment: readonly Slot[] = [
    { id: 'sword', x: 0, icon: imageRef('ui/mail-report-detail/equip-sword'), w: 47, h: 49 },
    { id: 'bottle', x: 75, icon: imageRef('ui/mail-report-detail/equip-bottle'), w: 53, h: 46 },
    { id: 'horn', x: 148, icon: imageRef('ui/mail-report-detail/equip-horn'), w: 47, h: 45 },
    { id: 'shield', x: 223, icon: imageRef('ui/mail-report-detail/equip-shield'), w: 44, h: 51 },
];

export const ReportDetailSlots = defineComponent<{
    readonly left: number; readonly top: number; readonly ship?: boolean;
}>((p) => {
    const left = p.left;
    const top = p.top;
    const slots = p.ship ? shipSkills : equipment;
    const background = p.ship ? imageRef('ui/mail-report-detail/slot') : imageRef('ui/mail-report-detail/equip-slot');
    return <view name="ReportDetailSlots" style={{ position: 'absolute', left: left, top: top, width: 291, height: 68 }}>
        <For each={slots} key="id">{(slot) => <ReportDetailSlot slot={slot} background={background} />}</For>
    </view>;
});

export const ReportDetailSlot = defineComponent<{ readonly slot: Slot; readonly background: ImageRef }>((p) => {
    const slot = p.slot;
    const left = slot.x;
    const width = slot.w;
    const height = slot.h;
    const iconLeft = (68 - width) / 2;
    const iconTop = (68 - height) / 2;
    return <view style={{ position: 'absolute', left: left, top: 0, width: 68, height: 68 }}>
                <image source={p.background} style={{ position: 'absolute', width: 68, height: 68 }} />
                <image source={slot.icon} style={{ position: 'absolute', left: iconLeft, top: iconTop, width: width, height: height }} />
            </view>;
});
