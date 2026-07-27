// Generated from @gono/webplatform-contract. Do not edit.
export * from "./paths.generated";
export type { components, operations, paths } from "./types.generated";

import type { components } from "./types.generated";

export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type WxLoginRequest = components["schemas"]["WxLoginRequest"];
export type DevLoginRequest = components["schemas"]["DevLoginRequest"];
export type LoginResponse = components["schemas"]["LoginResponse"];
export type AreaServer = components["schemas"]["AreaServer"];
export type AreaListResponse = components["schemas"]["AreaListResponse"];
export type VerifySessionRequest = components["schemas"]["VerifySessionRequest"];
export type VerifySessionResponse = components["schemas"]["VerifySessionResponse"];
export type RegisterCharacterResponse = components["schemas"]["RegisterCharacterResponse"];
export type HasCharacterResponse = components["schemas"]["HasCharacterResponse"];
export type AdminAccountRequest = components["schemas"]["AdminAccountRequest"];
export type AdminAccountResponse = components["schemas"]["AdminAccountResponse"];
export type LiveResponse = components["schemas"]["LiveResponse"];
export type ReadyResponse = components["schemas"]["ReadyResponse"];
export type VersionResponse = components["schemas"]["VersionResponse"];

// Consumer-facing aliases are prefixed so they can coexist with a game's own
// HTTP contracts when this package is mirrored into a shared protocol barrel.
export type WebPlatformLoginResponse = LoginResponse;
export type WebPlatformAreaServer = AreaServer;
export type WebPlatformAreaListResponse = AreaListResponse;
