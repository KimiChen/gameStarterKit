/** One selection contract shared by local component tabs and navigation-scope tabs. */
export interface TabController<Key extends string = string> {
    readonly selectedKey: Key;
    select(key: Key): void | Promise<void>;
}
export interface SurfaceTabGroup<Key extends string = string> {
    readonly activeKey: string | undefined;
    activate(key: Key): Promise<void>;
}
/**
 * Adapts an exclusive navigation scope to the same contract consumed by Tabs.
 * The navigation owner remains responsible for re-rendering its external tab bar
 * from navigator notifications.
 */
export declare function createSurfaceTabs<Key extends string>(group: SurfaceTabGroup<Key>, initialKey: Key): TabController<Key>;
