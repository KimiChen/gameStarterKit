/** SC0-only raw pointer bridge. Not a public gameplay port or SC1 input policy. */
import type { EventMouse, EventTouch } from "cc";
import { SpikePointerOwnership, type SpikePointerOwner, type SpikePointerPhase } from "../../logic/page/Stage3dFixtureLogic";

export interface SpikeWorldSubscriber {
    touch(phase: SpikePointerPhase, event: EventTouch): void;
    wheel?(event: EventMouse): void;
    cancel(): void;
    inspect?(): unknown;
}

interface WorldOwner { readonly generation: number; readonly subscriber: SpikeWorldSubscriber; }
interface PendingPointer { readonly owner: SpikePointerOwner; readonly event: EventTouch; readonly world: WorldOwner | null; }
let world: WorldOwner | null = null;
let worldGeneration = 0;
let adapterGeneration = 0;
let active = false;
let blocked = false;
let cancelling = false;
let cancelHud: ((id: number, event: EventTouch) => void) | null = null;
const pending = new Map<number, PendingPointer>();
const counters = { worldStarts: 0, worldMoves: 0, worldEnds: 0, worldCancels: 0, worldWheels: 0, hudStarts: 0, cancellations: 0 };

/** Cocos reuses one EventTouch while iterating getTouches(); keep cancellation's ID stable. */
function cancellationSnapshot(event: EventTouch, id: number): EventTouch {
    const ui = event.getUILocation();
    const raw = event as EventTouch & { getLocation?: () => { x: number; y: number } };
    const location = raw.getLocation?.();
    const uiX = ui.x, uiY = ui.y;
    const x = location?.x ?? uiX, y = location?.y ?? uiY;
    const snapshot = Object.create(event) as EventTouch;
    Object.defineProperties(snapshot, {
        getID: { value: () => id },
        getUILocation: { value: () => ({ x: uiX, y: uiY }) },
        getLocation: { value: () => ({ x, y }) },
    });
    return snapshot;
}
const ownership = new SpikePointerOwnership((id, owner) => {
    const pointer = pending.get(id);
    pending.delete(id);
    if (!pointer) return;
    if (owner === "hud") cancelHud?.(id, pointer.event);
    else if (pointer.world) {
        counters.worldCancels++;
        pointer.world.subscriber.touch("cancel", pointer.event);
    }
});

function cancelOwnedInput(target: WorldOwner | null, releaseOwnership = () => ownership.cancelAll()): void {
    const alreadyCancelling = cancelling;
    cancelling = true;
    counters.cancellations++;
    let failed = false;
    let firstError: unknown;
    const attempt = (action: () => void): void => {
        try { action(); }
        catch (error) { if (!failed) { failed = true; firstError = error; } }
    };
    try {
        attempt(releaseOwnership);
        attempt(() => target?.subscriber.cancel());
    }
    finally {
        // The parallel map owns EventTouch snapshots and the previous world subscriber.
        // Release it even if a callback failed or an earlier cancellation lost ownership.
        // A HUD callback may synchronously open a modal and reenter cancellation.
        // Its outer pass still needs the remaining pointer snapshots.
        if (!alreadyCancelling) pending.clear();
        cancelling = alreadyCancelling;
    }
    // Host hide/modal/close must finish even when a subscriber fails. Keep the
    // first failure visible to Creator/probe error collection after all cleanup.
    if (failed) console.error("[stage3d spike] input cancellation failed", firstError);
}

/** Last registration wins. Releasing an old owner never restores or removes another. */
export function registerSpikeWorld(subscriber: SpikeWorldSubscriber): () => void {
    const generation = ++worldGeneration;
    const previous = world;
    world = null;
    if (active) cancelOwnedInput(previous);
    const owner: WorldOwner = { generation, subscriber };
    if (worldGeneration === generation) world = owner;
    return () => {
        if (world !== owner) return;
        world = null;
        worldGeneration++;
        if (active) cancelOwnedInput(owner);
    };
}

/** Framework bridge only: invoked by the temporary GRoot adapter. */
export function activateSpikeInputAdapter(onHudCancel: (id: number, event: EventTouch) => void): () => void {
    cancelOwnedInput(world);
    const generation = ++adapterGeneration;
    cancelHud = onHudCancel;
    active = true;
    return () => {
        if (generation !== adapterGeneration) return;
        // Keep routing disabled during callbacks so a release cannot revive a drag.
        active = false;
        try { cancelOwnedInput(world); }
        finally { if (generation === adapterGeneration) cancelHud = null; }
    };
}

export function isSpikeInputActive(): boolean { return active; }
export function isSpikeInputBlocked(): boolean { return blocked; }
export function peekSpikePointerOwner(id: number): SpikePointerOwner | null { return pending.get(id)?.owner ?? null; }

export function setSpikeInputBlocked(value: boolean): void {
    if (blocked === value) return;
    blocked = value;
    // Set the manager guard before emitting cancellation callbacks.
    if (value) cancelOwnedInput(active ? world : null, () => ownership.setBlocked(true));
    else ownership.setBlocked(false);
}

/** Includes HUD pointer ownership, so a hide/close cannot resume an old HUD press. */
export function cancelSpikeWorldInput(): void { if (active) cancelOwnedInput(world); }

export function routeSpikeTouch(phase: SpikePointerPhase, event: EventTouch, hit: SpikePointerOwner): SpikePointerOwner | null {
    if (!active || blocked || cancelling) return null;
    const id = event.getID();
    const owner = ownership.route(id, phase, hit);
    if (!owner || !active || blocked || cancelling) return null;
    const pointerWorld = phase === "start" ? world : pending.get(id)?.world ?? null;
    if (phase === "end" || phase === "cancel") pending.delete(id);
    else pending.set(id, { owner, event: cancellationSnapshot(event, id), world: pointerWorld });
    if (owner === "hud") {
        if (phase === "start") counters.hudStarts++;
    } else if (pointerWorld && pointerWorld === world) {
        if (phase === "start") counters.worldStarts++;
        else if (phase === "move") counters.worldMoves++;
        else if (phase === "end") counters.worldEnds++;
        else counters.worldCancels++;
        pointerWorld.subscriber.touch(phase, event);
    }
    return owner;
}

export function routeSpikeWheel(event: EventMouse, hit: SpikePointerOwner): SpikePointerOwner | null {
    if (!active || blocked || cancelling) return null;
    if (hit === "world" && world?.subscriber.wheel) {
        counters.worldWheels++;
        world.subscriber.wheel(event);
    }
    return hit;
}

export function readSpikeInputDebug() {
    return { active, blocked, ownersCount: ownership.count, pendingCount: pending.size, worldGeneration: world?.generation ?? null,
        counters: { ...counters }, worldState: world?.subscriber.inspect?.() ?? null };
}
