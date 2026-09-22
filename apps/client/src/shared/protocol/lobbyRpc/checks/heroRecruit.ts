/**
 * 英雄招募的公开商品目录。
 *
 * 价格与展示数据由 shared 单源维护：客户端只用它展示和预判可购性，服务端仍以同一份
 * 目录做最终扣款校验。首版是固定目录；运营配置接入时应替换此文件的来源，而不是让
 * 客户端传价格或名称。
 */
import { WireValidationError } from "../../http";

export interface HeroRecruitCatalogEntry {
  readonly heroId: number;
  readonly name: string;
  readonly title: string;
  readonly rarity: number;
  readonly copperPrice: number;
}

export const HERO_RECRUIT_CATALOG: readonly HeroRecruitCatalogEntry[] =
  Object.freeze([
    Object.freeze({
      heroId: 1001,
      name: "赵云",
      title: "龙胆将军",
      rarity: 3,
      copperPrice: 500,
    }),
    Object.freeze({
      heroId: 1002,
      name: "貂蝉",
      title: "闭月舞姬",
      rarity: 4,
      copperPrice: 900,
    }),
    Object.freeze({
      heroId: 1003,
      name: "李白",
      title: "青莲剑仙",
      rarity: 5,
      copperPrice: 1500,
    }),
  ]);

const byHeroId = new Map(
  HERO_RECRUIT_CATALOG.map((entry) => [entry.heroId, entry]),
);

export function getHeroRecruitCatalogEntry(
  heroId: number,
): HeroRecruitCatalogEntry | undefined {
  return byHeroId.get(heroId);
}

export function isHeroRecruitCatalogId(heroId: number): boolean {
  return byHeroId.has(heroId);
}

/** wire 边界只接受共享目录内的英雄 ID。 */
export function validateHeroRecruitId(
  value: unknown,
  path = "payload.heroId",
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    !isHeroRecruitCatalogId(value)
  ) {
    throw new WireValidationError("HERO_RECRUIT_ID", path);
  }
  return value;
}
