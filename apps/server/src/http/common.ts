/**
 * HTTP 端点公共件（根层只放横切助手，端点一律在 <域>/ 子目录）。
 */
import { verifyBearer } from "../core/auth/session";

/** body.token → uid（09·G1：⛔ 不信客户端单独传的 userId，一律 token 反查）。失败返回 null，调用方回 401。 */
export async function uidFromToken(token: string): Promise<string | null> {
  try {
    return await verifyBearer(token, false);
  } catch {
    return null;
  }
}
