/** Operator-only module API, loaded by the host CLI; never registered as a player RPC. */
export interface NativeKitMaintenancePort {
    readonly version: 1
    status(): Promise<{ readonly phase: string; readonly dataVersion?: number }>
    drain(owner: string): Promise<{ readonly phase: 'draining' | 'drained' }>
    resume(): Promise<void>
    cancel(owner: string): Promise<void>
}
