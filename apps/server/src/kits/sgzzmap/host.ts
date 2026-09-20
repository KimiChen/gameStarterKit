/** 宿主接线只消费 kitApi。⛔ kit 不直接 import core/infra 的其他模块。 */
import { currentZoneId } from "../../core/infra/kitApi";

export { currentZoneId };
