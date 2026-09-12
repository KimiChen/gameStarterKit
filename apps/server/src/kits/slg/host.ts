/** 宿主接线只消费 kitApi；读奖杯显式携带区号，不依赖 Lobby 的 ambient zone。 */
import { currentZoneId, readKitUserFieldInZone } from "../../framework/infra/kitApi";

export { currentZoneId };
export async function readSlgTrophies(uid: string, sId: number): Promise<number> {
  const raw = await readKitUserFieldInZone("slg", "stats", uid, "trophies", sId);
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("SLG trophies 数据异常");
  return value;
}
