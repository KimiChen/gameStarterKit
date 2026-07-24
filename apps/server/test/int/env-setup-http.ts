/**
 * split-e2e 专用环境前置：ACCOUNT_MODE=http 必须在 config/accountClient **模块加载前**置位
 * （ESM import 提升——顶部 `process.env.X=` 实际晚于被 import 模块的模块级读取；故收进独立模块作**首个 import**）。
 * 一并含 env-setup 的限流放宽（boot server 需要）。⛔ 本模块不得 import 任何读 env 的 src 模块。
 */
process.env.ACCOUNT_MODE = "http";
process.env.RPC_RATE_CAPACITY = "200";
process.env.RPC_RATE_REFILL_PER_S = "100";
export {};
