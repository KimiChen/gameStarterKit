/**
 * 压测 bot（@colyseus/loadtest，回流自 Arthur）：每个虚拟客户端加入 game 房间并随机游走。
 *
 * 运行：npm --workspace @game/server run loadtest（默认 20 连接），或
 *   npm --workspace @game/server exec tsx loadtest/bot.ts -- --endpoint ws://localhost:2568 --room game --numClients 50
 * 需要 dev server 已启动（npm run dev）；mock 链路即可，不依赖本地栈。
 */
import { cli, type Options } from "@colyseus/loadtest";
import { Client } from "@colyseus/sdk";
import { C2S, PROTOCOL_VERSION, type IMoveReq } from "@game/shared";

async function main(options: Options) {
    const client = new Client(options.endpoint);
    const room = await client.joinOrCreate(options.roomName, { v: PROTOCOL_VERSION });

    // 每 200ms 换一个随机方向（服务端按逻辑帧积分位置，输入只有方向）
    const timer = setInterval(() => {
        const angle = Math.random() * Math.PI * 2;
        const move: IMoveReq = { dirX: Math.cos(angle), dirY: Math.sin(angle) };
        room.send(C2S.Move, move);
    }, 200);

    room.onMessage("*", () => { /* 吞掉服务器消息，避免未注册处理器告警 */ });
    room.onLeave(() => clearInterval(timer));
}

cli(main);
