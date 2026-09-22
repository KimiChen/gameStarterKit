/**
 * 英雄招募的纯 TS 页面逻辑。价格与目录只来自服务端快照；点击时只传 heroId，绝不把
 * 客户端显示的价格带回服务端。渲染由 ../view/HeroRecruitSceneView.ts 负责。
 */
import type {
  IHeroRecruitCatalogEntry,
  IHeroRecruitSnapshot,
} from "../../../shared/protocol/lobbyRpc/domains/heroRecruit";
import type { HeroRecruitRuntime } from "./heroRecruitRuntime";

export type HeroRecruitNoticeKind = "idle" | "success" | "error";

export interface HeroRecruitNotice {
  readonly kind: HeroRecruitNoticeKind;
  readonly text: string;
}

const IDLE: HeroRecruitNotice = {
  kind: "idle",
  text: "选择一名未拥有的英雄招募",
};
const NOT_READY: HeroRecruitNotice = {
  kind: "error",
  text: "英雄招募未就绪（plugin 未装载）",
};

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function describeHeroRecruitError(error: unknown): string {
  switch (errorCodeOf(error)) {
    case "HERO_RECRUIT_UNKNOWN":
      return "该英雄当前不可招募";
    case "HERO_RECRUIT_ALREADY_OWNED":
      return "你已经拥有这名英雄";
    case "HERO_RECRUIT_INSUFFICIENT_COPPER":
      return "铜币不足，继续完成收益即可招募";
    case "CONN_LOST":
    case "TIMEOUT":
      return "网络不可用，稍后重试（已发出的招募不会重复扣款）";
    default: {
      const code = errorCodeOf(error);
      return code ? `招募失败（${code}）` : "招募失败，请稍后重试";
    }
  }
}

export class HeroRecruitLogic {
  onChanged: () => void = () => {};

  private snapshot: IHeroRecruitSnapshot | null = null;
  private busy = false;
  private notice: HeroRecruitNotice;

  constructor(private readonly runtime: HeroRecruitRuntime | null) {
    this.notice = runtime ? IDLE : NOT_READY;
  }

  isReady(): boolean {
    return this.runtime !== null;
  }
  isBusy(): boolean {
    return this.busy;
  }
  currentNotice(): HeroRecruitNotice {
    return this.notice;
  }
  snapshotOf(): IHeroRecruitSnapshot | null {
    return this.snapshot;
  }
  copper(): number {
    return this.snapshot?.copper ?? 0;
  }
  catalog(): readonly IHeroRecruitCatalogEntry[] {
    return this.snapshot?.catalog ?? [];
  }
  owns(heroId: number): boolean {
    return this.snapshot?.ownedHeroIds.includes(heroId) ?? false;
  }

  canBuy(hero: IHeroRecruitCatalogEntry): boolean {
    return (
      this.runtime !== null &&
      !this.busy &&
      this.snapshot !== null &&
      !this.owns(hero.heroId) &&
      this.copper() >= hero.copperPrice
    );
  }

  async refresh(): Promise<boolean> {
    const runtime = this.runtime;
    if (!runtime || this.busy) return false;
    this.busy = true;
    this.onChanged();
    try {
      this.snapshot = (await runtime.getCatalog()).snapshot;
      this.notice = IDLE;
      return true;
    } catch (error) {
      this.notice = { kind: "error", text: describeHeroRecruitError(error) };
      return false;
    } finally {
      this.busy = false;
      this.onChanged();
    }
  }

  /** 单次招募：在途、未加载、已拥有或余额不足时不发请求。 */
  async buy(heroId: number): Promise<boolean> {
    const hero = this.catalog().find((item) => item.heroId === heroId);
    const runtime = this.runtime;
    if (!runtime || !hero || !this.canBuy(hero)) return false;
    this.busy = true;
    this.onChanged();
    try {
      const result = await runtime.buy(heroId);
      this.snapshot = result.snapshot;
      this.notice = {
        kind: "success",
        text: `已招募 ${hero.name}，剩余铜币 ${result.snapshot.copper}`,
      };
      return true;
    } catch (error) {
      this.notice = { kind: "error", text: describeHeroRecruitError(error) };
      return false;
    } finally {
      this.busy = false;
      this.onChanged();
    }
  }

  close(): void {
    this.runtime?.close();
  }
}
