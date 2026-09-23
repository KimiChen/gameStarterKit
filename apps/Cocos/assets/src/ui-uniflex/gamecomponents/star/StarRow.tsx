import { defineComponent, For, useMemo } from '@uniflex/compiler';
import { STAR_HEIGHT, STAR_WIDTH, StarLevel } from './StarLevel';

/** Five upgrade stars at the manuscript pitch: 86, 86, 85, 86. */
const SLOT_LEFT = [0, 86, 172, 257, 343] as const;
const STAR_POINTS = 5;

export const STAR_ROW_WIDTH = 411;
export const STAR_ROW_HEIGHT = STAR_HEIGHT;

export interface StarRowProps {
    /** Total star level, 0–25. Each star holds 5. Level 6 is a full star plus a 1-star. */
    readonly value: number;
    /** Shown stars. Defaults to 5. */
    readonly count?: number;
    readonly visible?: boolean;
}

interface StarSlot {
    readonly id: string;
    readonly left: number;
    readonly lit: number;
}

function starSlots(level: number, count: number): readonly StarSlot[] {
    const shown = count <= 0 ? 0 : count >= SLOT_LEFT.length ? SLOT_LEFT.length : Math.floor(count);
    const slots: StarSlot[] = [];
    let index = 0;
    while (index < shown) {
        const points = level - index * STAR_POINTS;
        const lit = points <= 0 ? 0 : points >= STAR_POINTS ? STAR_POINTS : points;
        slots.push({ id: String(index), left: SLOT_LEFT[index] ?? 0, lit });
        index += 1;
    }
    return slots;
}

/** A row of upgrade stars. One star level fills the slots from the left. */
export const StarRow = defineComponent<StarRowProps>((p) => {
    const raw = p.value ?? 0;
    const level = raw <= 0 ? 0 : raw >= SLOT_LEFT.length * STAR_POINTS ? SLOT_LEFT.length * STAR_POINTS : Math.floor(raw);
    const count = p.count ?? SLOT_LEFT.length;
    const visible = p.visible !== false;
    const slots = useMemo(() => starSlots(level, count), [level, count]);
    return (
        <view name="StarRow" visible={visible}
            style={{ position: 'absolute', left: 0, top: 0, width: STAR_ROW_WIDTH, height: STAR_ROW_HEIGHT }}>
            <For each={slots} key="id">
                {(slot) => (
                    <view style={{ position: 'absolute', left: slot.left, top: 0, width: STAR_WIDTH, height: STAR_HEIGHT }}>
                        <StarLevel value={slot.lit} />
                    </view>
                )}
            </For>
        </view>
    );
});
