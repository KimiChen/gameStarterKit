/**
 * 时间/自然日纯函数 —— 双端共享（回流自 Arthur）。
 *
 * ⚠ 时区前提：`isNewNaturalDay` 用宿主本地时区归一化到午夜。服务端做每日判定的
 * 唯一真源时，**部署必须钉死 TZ（如 TZ=Asia/Shanghai）**，否则跨机器/容器结果漂移；
 * 客户端只拿它做展示预判，权威判定一律以服务端为准（配 GET /clock/now 对时）。
 */

/** 两时间戳是否跨了自然日（本地时区，按午夜归一化）。lastMs<=0（首次）不算跨日。 */
export function isNewNaturalDay(lastMs: number, nowMs: number): boolean {
    if (lastMs <= 0) return false;
    const midnight = (ms: number): number => {
        const d = new Date(ms);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    return midnight(nowMs) > midnight(lastMs);
}
