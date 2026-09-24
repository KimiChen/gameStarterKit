import { Color, Graphics, Label, Node, UITransform } from 'cc';
import type {
    IGameDemoBossEvent,
    IGameDemoBossFighter,
    IGameDemoBossState,
} from '../../../shared/protocol/lobbyRpc/domains/gameDemo';
import { GameDemoBossEvents } from '../logic/GameDemoBossEvents';
import { GameDemoLogic } from '../logic/GameDemoLogic';
import {
    avatar,
    bar,
    button,
    circle,
    node,
    plate,
    polygon,
    red,
    text,
} from './GameDemoUI';
const gold = new Color(227, 195, 130);
const jade = new Color(169, 217, 180);
const muted = new Color(185, 198, 206);
interface Seat {
    root: Node;
    name: Label;
    status: Label;
    hp: (ratio: number) => void;
    x: number;
    y: number;
}
interface Effect {
    root: Node;
    start: number;
    duration: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
}
/** Persistent scene. Authoritative event sequence prevents duplicate effects after a snapshot / reconnect. */
export class GameDemoBossScene {
    private readonly hp: (ratio: number) => void;
    private readonly hpText: Label;
    private readonly hint: Label;
    private readonly mine: Label;
    private readonly roster: Label;
    private readonly rank: Label;
    private readonly boss: Node;
    private readonly seats = new Map<number, Seat>();
    private effects: Effect[] = [];
    private readonly events = new GameDemoBossEvents();
    private runNumber = 0;
    private expanded: Node | null = null;
    private state: IGameDemoBossState | null = null;
    private playersPage = 0;
    private readonly stage: Node;
    private readonly stageHeight: number;
    constructor(
        parent: Node,
        height: number,
        private readonly logic: GameDemoLogic,
        private readonly act: (action: () => Promise<void>) => void,
    ) {
        this.stageHeight = height - 460;
        const h = this.stageHeight;
        this.stage = node(parent, 'Boss战场', 0, 40);
        const art = node(this.stage, '山林与石台');
        const bg = art.addComponent(Graphics);
        // Painted silhouettes, low fog and a stone arena leave the middle clear for sword paths.
        plate(this.stage, 0, 0, 750, h, new Color(17, 35, 44)).setSiblingIndex(0);
        circle(bg, 120, h * 0.27, 115, new Color(34, 61, 67));
        polygon(
            bg,
            [
                [-375, h * 0.07],
                [-285, h * 0.3],
                [-192, h * 0.19],
                [-62, h * 0.38],
                [60, h * 0.08],
                [250, h * 0.32],
                [375, h * 0.12],
                [375, -h * 0.18],
                [-375, -h * 0.18],
            ],
            new Color(29, 53, 61),
        );
        polygon(
            bg,
            [
                [-375, -h * 0.12],
                [-210, h * 0.04],
                [-100, -h * 0.1],
                [115, h * 0.09],
                [310, -h * 0.04],
                [375, h * 0.02],
                [375, -h * 0.36],
                [-375, -h * 0.36],
            ],
            new Color(22, 43, 51),
        );
        polygon(
            bg,
            [
                [-300, -h * 0.48],
                [-215, -h * 0.06],
                [180, h * 0.02],
                [365, -h * 0.48],
            ],
            new Color(35, 53, 56),
        );
        bg.strokeColor = new Color(73, 102, 99);
        bg.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            bg.circle(75, -h * 0.26, 115 + i * 45);
            bg.stroke();
        }
        this.hp = bar(this.stage, 74, h * 0.43, 480, 14, red);
        this.hpText = text(this.stage, '', 74, h * 0.47, 490, 22, gold);
        this.hint = text(this.stage, '点击 Boss · 御剑自动攻击', 74, h * 0.05, 510, 24, jade);
        this.boss = node(this.stage, '选择Boss', 75, h * 0.25);
        this.boss.addComponent(UITransform).setContentSize(290, 300);
        const g = this.boss.addComponent(Graphics);
        const id = logic.bossId;
        const tint = id === 'phoenix' ? new Color(210, 119, 84) : id === 'dragon' ? jade : gold;
        circle(g, 0, 0, 115, new Color(14, 29, 35));
        g.strokeColor = tint;
        g.lineWidth = 2;
        g.circle(0, 0, 125);
        g.stroke();
        if (id === 'tiger') {
            polygon(
                g,
                [
                    [-95, 45],
                    [-112, 118],
                    [-50, 91],
                    [0, 100],
                    [50, 91],
                    [112, 118],
                    [95, 45],
                    [75, -62],
                    [0, -102],
                    [-75, -62],
                ],
                tint,
            );
            polygon(
                g,
                [
                    [-80, 42],
                    [-25, 20],
                    [-55, 6],
                ],
                new Color(20, 38, 43),
            );
            polygon(
                g,
                [
                    [80, 42],
                    [25, 20],
                    [55, 6],
                ],
                new Color(20, 38, 43),
            );
            polygon(
                g,
                [
                    [-22, -25],
                    [22, -25],
                    [0, -46],
                ],
                new Color(42, 48, 45),
            );
            polygon(
                g,
                [
                    [-42, -38],
                    [-22, -42],
                    [-29, -83],
                ],
                new Color(247, 236, 204),
            );
            polygon(
                g,
                [
                    [42, -38],
                    [22, -42],
                    [29, -83],
                ],
                new Color(247, 236, 204),
            );
            for (let i = 0; i < 3; i++)
                polygon(
                    g,
                    [
                        [-25, 79 - i * 17],
                        [25, 79 - i * 17],
                        [0, 65 - i * 17],
                    ],
                    new Color(65, 68, 53),
                );
        } else if (id === 'dragon') {
            polygon(
                g,
                [
                    [-80, 40],
                    [-105, 131],
                    [-48, 89],
                    [0, 70],
                    [48, 89],
                    [105, 131],
                    [80, 40],
                    [98, -14],
                    [32, -91],
                    [-32, -91],
                    [-98, -14],
                ],
                tint,
            );
            polygon(
                g,
                [
                    [-58, 25],
                    [-12, 13],
                    [-45, 0],
                ],
                new Color(20, 38, 43),
            );
            polygon(
                g,
                [
                    [58, 25],
                    [12, 13],
                    [45, 0],
                ],
                new Color(20, 38, 43),
            );
            polygon(
                g,
                [
                    [-23, -50],
                    [23, -50],
                    [0, -77],
                ],
                gold,
            );
        } else {
            polygon(
                g,
                [
                    [0, 108],
                    [-28, 40],
                    [-125, 112],
                    [-87, 4],
                    [-29, -55],
                    [0, -119],
                    [29, -55],
                    [87, 4],
                    [125, 112],
                    [28, 40],
                ],
                tint,
            );
            polygon(
                g,
                [
                    [-16, 19],
                    [0, 45],
                    [16, 19],
                    [0, -12],
                ],
                gold,
            );
        }
        this.boss.on(Node.EventType.TOUCH_END, () => this.toggle());
        const rankPanel = plate(
            this.stage,
            -301,
            h * 0.19,
            120,
            h * 0.47,
            new Color(13, 25, 32, 240),
            '伤害榜',
        );
        text(rankPanel, '伤害榜', 0, h * 0.19, 114, 23, gold);
        this.rank = text(
            rankPanel,
            '暂无伤害',
            0,
            -10,
            108,
            20,
            muted,
            Label.HorizontalAlign.CENTER,
            h * 0.34,
        );
        rankPanel.on(Node.EventType.TOUCH_END, () => this.expand());
        this.roster = text(this.stage, '', 65, -h * 0.45, 530, 21, muted);
        button(parent, '上一组', -240, -height / 2 + 235, 180, () => this.turn(-1), false, 72);
        button(parent, '下一组', 0, -height / 2 + 235, 180, () => this.turn(1), false, 72);
        button(
            parent,
            '离开战场',
            240,
            -height / 2 + 235,
            180,
            () => act(() => logic.leaveBoss()),
            false,
            72,
        );
        this.mine = text(parent, '', 0, -height / 2 + 162, 670, 25, new Color(99, 66, 135));
    }
    private toggle(): void {
        const p = this.state?.room.fighters.find((p) => p.uid === this.state?.uid);
        if (this.state?.room.phase !== 'running') return;
        this.act(() => this.logic.attackBoss(!p?.autoAttack));
    }
    private turn(delta: number): void {
        const count = this.state?.room.fighters.filter((p) => p.active).length ?? 0;
        this.playersPage = Math.max(
            0,
            Math.min(Math.max(0, Math.ceil(count / 6) - 1), this.playersPage + delta),
        );
        if (this.state) this.update(this.state);
    }
    update(state: IGameDemoBossState): void {
        this.state = state;
        this.hp(state.room.hp / state.room.maxHp);
        this.hpText.string = `${state.room.name}  ·  ${state.room.hp} / ${state.room.maxHp}`;
        this.mine.string = `我的伤害 ${state.myDamage}     攻击力 ${state.heroAttack}`;
        this.rank.string =
            state.room.damage
                .slice(0, 5)
                .map(
                    (d) =>
                        `${d.rank === 1 ? '冠' : d.rank} ${d.uid === state.uid ? '我' : String(d.uid).slice(-3)}\n${d.damage}`,
                )
                .join('\n') || '暂无\n伤害';
        const players = [...(state.room.fighters.filter((p) => p.active) ?? [])].sort((a, b) =>
            a.uid === state.uid ? -1 : b.uid === state.uid ? 1 : a.uid - b.uid,
        );
        this.playersPage = Math.min(this.playersPage, Math.max(0, Math.ceil(players.length / 6) - 1));
        const visible = players.slice(this.playersPage * 6, this.playersPage * 6 + 6);
        const ids = new Set(visible.map((p) => p.uid));
        for (const [uid, seat] of this.seats)
            if (!ids.has(uid)) {
                seat.root.destroy();
                this.seats.delete(uid);
            }
        visible.forEach((p, i) => {
            const x = -110 + (i % 3) * 190,
                y = -this.stageHeight * 0.4 + (i < 3 ? 320 : 120);
            let seat = this.seats.get(p.uid);
            if (!seat) {
                const root = node(this.stage, `玩家-${p.uid}`, x, y);
                const g = root.addComponent(Graphics);
                avatar(g, 0, 0, 43, p.uid === state.uid ? jade : muted);
                seat = {
                    root,
                    x,
                    y,
                    name: text(
                        root,
                        p.uid === state.uid ? '我' : String(p.uid).slice(-6),
                        0,
                        -65,
                        166,
                        22,
                        p.uid === state.uid ? jade : muted,
                    ),
                    status: text(root, '', 0, -110, 175, 20, muted),
                    hp: bar(root, 0, -85, 115, 7),
                };
                this.seats.set(p.uid, seat);
            }
            seat.x = x;
            seat.y = y;
            seat.root.setPosition(x, y);
            seat.hp(p.hp / p.maxHp);
            seat.root.setScale(p.hp ? 1 : 0.88, p.hp ? 1 : 0.88, 1);
            this.playerText(seat, p);
        });
        this.roster.string = `参战 ${players.length} 人  ·  第 ${this.playersPage + 1}/${Math.max(1, Math.ceil(players.length / 6))} 组`;
        if (this.runNumber !== state.room.runNumber) {
            this.runNumber = state.room.runNumber;
            this.clearEffects();
        }
        for (const event of this.events.take(state)) this.animate(event);
        this.tick();
        if (this.expanded) this.renderRanks();
    }
    tick(): void {
        if (!this.state) return;
        const now = this.logic.bossNow();
        const mine = this.state.room.fighters.find((p) => p.uid === this.state?.uid);
        const remaining = Math.max(0, Math.ceil(((mine?.reviveAt ?? 0) - now) / 1000));
        this.hint.string =
            this.state.room.phase !== 'running'
                ? `Boss 已击败 · 奖励将送至邮件\n${Math.max(0, Math.ceil((this.state.room.respawnAt - now) / 1000))} 秒后下一局`
                : !mine?.hp && mine
                  ? `元神归位中 · ${remaining || '稍候'} 秒复活`
                  : mine?.autoAttack
                    ? '御剑中 · 再点 Boss 停止'
                    : '点击 Boss · 御剑自动攻击';
        if (this.logic.errorText) this.hint.string = this.logic.errorText;
        for (const p of this.state.room.fighters) {
            const seat = this.seats.get(p.uid);
            if (seat) this.playerText(seat, p);
        }
        const elapsed = Date.now();
        for (const effect of this.effects) {
            const t = Math.min(1, (elapsed - effect.start) / effect.duration);
            effect.root.setPosition(
                effect.x + (effect.tx - effect.x) * t,
                effect.y + (effect.ty - effect.y) * t,
            );
            if (t >= 1) effect.root.destroy();
        }
        this.effects = this.effects.filter((e) => elapsed - e.start < e.duration);
    }
    private playerText(seat: Seat, p: IGameDemoBossFighter): void {
        seat.status.string = p.hp
            ? `${p.hp}/${p.maxHp}${p.autoAttack ? ' · 御剑' : ''}`
            : `复活 ${Math.max(0, Math.ceil((p.reviveAt - this.logic.bossNow()) / 1000))} 秒`;
        seat.status.color = p.hp ? muted : red;
    }
    private animate(event: IGameDemoBossEvent): void {
        const seat = this.seats.get(event.uid);
        if (!seat || this.effects.length >= 36) return;
        const sword = event.kind === 'sword';
        const root = node(this.stage, '战斗特效');
        let x = seat.x,
            y = seat.y,
            tx = seat.x,
            ty = seat.y + 80;
        if (sword) {
            x = seat.x;
            y = seat.y + 30;
            tx = 75;
            ty = this.stageHeight * 0.25;
            const blade = plate(root, 0, 0, 5, 65, jade, '飞剑');
            blade.angle = (-Math.atan2(tx - x, ty - y) * 180) / Math.PI;
            const glow = plate(blade, 0, -15, 14, 4, gold);
            glow.name = '剑格';
        } else {
            text(
                root,
                event.kind === 'revive' ? '复活' : `-${event.amount}`,
                0,
                0,
                180,
                35,
                event.kind === 'revive' ? jade : red,
            );
        }
        this.effects.push({ root, start: Date.now(), duration: sword ? 420 : 900, x, y, tx, ty });
        if (event.kind === 'counter') {
            const beam = plate(this.stage, 75, this.stageHeight * 0.25, 9, 60, red, '反击');
            beam.angle = (-Math.atan2(seat.x - 75, seat.y - this.stageHeight * 0.25) * 180) / Math.PI;
            this.effects.push({
                root: beam,
                start: Date.now(),
                duration: 350,
                x: 75,
                y: this.stageHeight * 0.25,
                tx: seat.x,
                ty: seat.y,
            });
        }
    }
    private expand(): void {
        if (this.expanded) {
            this.expanded.destroy();
            this.expanded = null;
            return;
        }
        this.expanded = plate(
            this.stage,
            0,
            0,
            650,
            this.stageHeight * 0.75,
            new Color(15, 30, 38),
            '完整伤害榜',
        );
        this.expanded.on(Node.EventType.TOUCH_END, () => {});
        this.renderRanks();
    }
    private renderRanks(): void {
        const p = this.expanded!;
        for (const child of [...p.children]) {
            child.removeFromParent();
            child.destroy();
        }
        text(p, '伤害排行榜 · 前 10 名', 0, this.stageHeight * 0.3, 600, 32, gold);
        text(
            p,
            this.state!.room.damage.slice(0, 10)
                .map(
                    (d) =>
                        `${d.rank}    ${d.uid === this.state!.uid ? '我' : String(d.uid).slice(-10)}       ${d.damage}`,
                )
                .join('\n') || '尚无伤害记录',
            0,
            10,
            570,
            27,
            muted,
            Label.HorizontalAlign.CENTER,
            this.stageHeight * 0.47,
        );
        button(p, '收起', 0, -this.stageHeight * 0.29, 260, () => this.expand(), false, 80);
    }
    private clearEffects(): void {
        for (const e of this.effects) e.root.destroy();
        this.effects = [];
    }
    dispose(): void {
        this.clearEffects();
    }
}
