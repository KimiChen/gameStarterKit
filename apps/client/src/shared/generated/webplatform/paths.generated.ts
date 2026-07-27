// Generated from @gono/webplatform-contract. Do not edit.
export const WEBPLATFORM_CONTRACT_VERSION = "1.0.0";

export const WebPlatformPath = {
  BanAccount: "/v1/admin/accounts/{userId}/ban",
  DevLogin: "/v1/sessions/dev",
  HasCharacter: "/v1/internal/characters/{userId}/{serverId}",
  ListAreas: "/v1/areas",
  Livez: "/livez",
  Readyz: "/readyz",
  RegisterCharacter: "/v1/internal/characters/{userId}/{serverId}",
  RevokeAccount: "/v1/admin/accounts/{userId}/revoke",
  VerifySession: "/v1/internal/sessions/verify",
  Version: "/version",
  WxLogin: "/v1/sessions/wechat",
} as const;

export const WebPlatformMethod = {
  BanAccount: "POST",
  DevLogin: "POST",
  HasCharacter: "GET",
  ListAreas: "GET",
  Livez: "GET",
  Readyz: "GET",
  RegisterCharacter: "PUT",
  RevokeAccount: "POST",
  VerifySession: "POST",
  Version: "GET",
  WxLogin: "POST",
} as const;
