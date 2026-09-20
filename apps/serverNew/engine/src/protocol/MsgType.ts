/**
 * 旧二进制通道的消息类型号。
 *
 * `MessageS2Client`（1001）已随 P6 删除旧协议链一并移除：原生 Lobby 的推送走 shared 领域推送，
 * 不再存在 S2C 数字包类型。其余成员保留原值，避免改动运行期注册表键。
 */
export const enum MsgType {
    MessageC2Server = 1002,
    MessageLocalAction = 1003,
}
