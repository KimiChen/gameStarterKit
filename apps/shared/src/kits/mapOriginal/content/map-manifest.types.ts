/** 地图包发布契约。sourceSha256 只描述源文件，不用于校验平台纹理变体。 */
export interface MapoAssetRecord {
    readonly path: string;
    readonly type: "texture" | "buffer" | "effect";
    readonly sourceBytes: number;
    readonly sourceSha256: string;
    readonly crc32?: number;
    readonly size?: readonly [number, number];
}
export interface MapoManifest {
    readonly schemaVersion: 1;
    readonly mapId: string;
    readonly bundle: string;
    readonly contentVersion: string;
    readonly atlasLayoutVersion: string;
    readonly assets: Readonly<Record<string, MapoAssetRecord>>;
    readonly groups: Readonly<Record<string, {
        readonly dependencies: readonly string[];
        readonly assets: readonly string[];
        readonly sourceBytes: number;
    }>>;
    readonly bindings: Readonly<Record<string, string>>;
}
