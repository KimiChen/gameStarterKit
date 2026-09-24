import { Graphics, Label, Node, UITransform } from 'cc';
import { CocosView } from '../../../view/CocosView';
import { GameDemoLogic } from '../logic/GameDemoLogic';
import { getGameDemoRuntime } from '../logic/gameDemoRuntime';
import { GAME_DEMO_CONFIG } from '../../../shared/protocol/lobbyRpc/checks/gameDemo';
import type { ViewLifecycleContext } from '../../../view/ViewBase';
import { avatar, bar, button, circle, gold, icon, ink, input, jade, muted, navigationButton, node, plate, text, themedImage, loadGameDemoTheme, outline, white, type NavigationIcon } from './GameDemoUI';
import { openConfirm } from '../../../view/pages';
import { GameDemoBossScene } from './GameDemoBossScene';

const titles = {
    shop: '灵材商店',
    hero: '英雄培养',
    alchemy: '丹房',
    season: '炼丹盛会',
    guild: '仙盟',
    mail: '传音信笺',
    boss: '镇妖秘境',
};
export class GameDemoView extends CocosView {
    private logic: GameDemoLogic | null = null;
    private scene: GameDemoBossScene | null = null;
    private sceneKey = '';
    private more = false;
    private feedbackPending = false;
    private alchemyVisual: { flame: Node; progress: (ratio: number) => void } | null = null;
    protected onCreate(): Promise<void> { return loadGameDemoTheme(); }
    protected onOpen(context: ViewLifecycleContext): void {
        const runtime = getGameDemoRuntime();
        const logic = new GameDemoLogic(runtime);
        this.logic = logic;
        logic.onChanged = () => this.render();
        logic.watchClock(context.signal);
        runtime?.onTick(() => {
            this.syncLayout();
            this.scene?.tick();
            if (this.alchemyVisual && this.logic) {
                const ratio = 1 - this.logic.alchemyAnimationRemaining / GAME_DEMO_CONFIG.alchemy.animationMs;
                this.alchemyVisual.progress(ratio);
                const pulse = 1 + Math.sin(ratio * Math.PI * 8) * 0.07;
                this.alchemyVisual.flame.setScale(pulse, pulse, 1);
            }
        }, context.signal);
        this.render();
        this.observeAsync(() => logic.enter(), 'gameDemo-status');
    }
    protected onCloseLifecycle(): void {
        if (this.logic) this.logic.onChanged = () => {};
        this.logic = null;
        this.alchemyVisual = null;
        this.scene?.dispose();
        this.scene = null;
        this.sceneKey = '';
    }
    private readonly act = (action: () => Promise<void>): void => {
        this.observeAsync(action, 'gameDemo-action');
    };
    private syncLayout(): void {
        const parent = this.root.parent?.getComponent(UITransform);
        if (!parent || parent.width <= 0 || parent.height <= 0 ||
            (parent.width === this.layerWidth && parent.height === this.layerHeight)) return;
        this.layerWidth = parent.width;
        this.layerHeight = parent.height;
        this.root.getComponent(UITransform)?.setContentSize(parent.width, parent.height);
        this.root.setPosition((0.5 - parent.anchorX) * parent.width, (0.5 - parent.anchorY) * parent.height);
        // Recreate only the presentation when the viewport changes; keep battle state.
        this.sceneKey = '';
        this.render();
    }
    private render(): void {
        const l = this.logic;
        if (!l) return;
        this.showFeedback(l);
        const key = !this.more && l.page === 'boss' && l.bossId ? l.bossId : '';
        if (key && key === this.sceneKey && this.scene && l.bossState) {
            this.scene.update(l.bossState);
            return;
        }
        this.scene?.dispose();
        this.scene = null;
        this.sceneKey = '';
        this.alchemyVisual = null;
        for (const child of [...this.root.children]) {
            child.removeFromParent();
            child.destroy();
        }
        plate(this.root, 0, 0, this.layerWidth, this.layerHeight, ink);
        const scale = Math.min(this.layerWidth / 750, this.layerHeight / 1280);
        const h = Math.min(1624, this.layerHeight / scale);
        const p = node(this.root, 'gameDemo竖屏');
        p.setScale(scale, scale, 1);
        plate(p, 0, 0, 750, h, ink);
        themedImage(p, 'ui/mail/header', 0, h / 2 - 56, 750, 112, '内置标题栏');
        outline(text(p, 'gameDemo', -209, h / 2 - 58, 270, 36, white, Label.HorizontalAlign.LEFT));
        button(
            p,
            '设置',
            280,
            h / 2 - 58,
            130,
            () => this.observeAsync(() => l.close(), 'gameDemo-settings'),
            false,
            74,
        );
        text(p, `灵石 ${l.assets?.gold ?? '—'}`, 45, h / 2 - 58, 220, 23, white);

        const nav: [string, NavigationIcon][] = [
            ['英雄', 'hero'],
            ['商店', 'shop'],
            ['炼丹', 'alchemy'],
            ['Boss', 'boss'],
            ['更多', 'more'],
        ];
        plate(p, 0, -h / 2 + 65, 750, 130, ink);
        nav.forEach(([label, page], i) =>
            navigationButton(
                p,
                label,
                page,
                -288 + i * 144,
                -h / 2 + 73,
                () => {
                    if (page === 'more') {
                        this.more = !this.more;
                        this.render();
                        return;
                    }
                    this.more = false;
                    this.act(() => (page === 'boss' ? l.bossSelection() : l.selectPage(page)));
                },
                this.more ? page === 'more' : l.page === page || (page === 'more' && ['season', 'guild', 'mail'].includes(l.page)),
            ),
        );
        if (this.more) {
            this.heading(p, h, '修行手札', '活动、仙盟与奖励，都在这里');
            [
                ['活动榜', 'season', '炼丹积分 · 活动结束后邮件发奖'],
                ['仙盟', 'guild', '邀友同行 · 共赴仙途'],
                ['邮件', 'mail', '查阅消息 · 领取战斗与活动奖励'],
            ].forEach(([label, page, desc], i) => {
                const y = h / 2 - 350 - i * 210;
                plate(p, 0, y, 670, 180);
                text(p, desc, 0, y + 40, 610, 24, muted);
                button(
                    p,
                    label,
                    0,
                    y - 35,
                    590,
                    () => {
                        this.more = false;
                        this.act(() => l.selectPage(page as typeof l.page));
                    },
                    true,
                );
            });
            return;
        }
        if (key && l.bossState) {
            this.sceneKey = key;
            this.scene = new GameDemoBossScene(p, h, l, this.act);
            this.scene.update(l.bossState);
            return;
        }
        this.heading(
            p,
            h,
            titles[l.page],
            {
                shop: '灵草与灵露，炼丹之本',
                hero: '丹药化修为，飞剑破山河',
                alchemy: '一炉灵丹，兼得修为与盛会积分',
                season: '炼丹积分冲榜 · 奖励由邮件送达',
                guild: '同道相邀，共赴仙途',
                mail: '每份历练，皆有回响',
                boss: '三处秘境 · 独立共享战场',
            }[l.page],
        );
        if (l.page === 'shop') this.shop(p, h, l);
        else if (l.page === 'hero') this.hero(p, h, l);
        else if (l.page === 'alchemy') this.alchemy(p, h, l);
        else if (l.page === 'boss') this.bosses(p, h, l);
        else if (l.page === 'season') this.season(p, h, l);
        else if (l.page === 'guild') this.guild(p, h, l);
        else this.mail(p, h, l);
    }
    private showFeedback(l: GameDemoLogic): void {
        const message = l.errorText || (l.text.includes('邀请已发送') ? '邀请已发送，对方可在仙盟页接受。' : '');
        if (!message || this.feedbackPending) return;
        const original = l.text;
        this.feedbackPending = true;
        this.observeAsync(async () => {
            try { await openConfirm({ title: '提示', content: message, yesText: '知道了', noText: null }); }
            finally {
                this.feedbackPending = false;
                if (this.logic === l) {
                    if (l.text === original) l.text = '';
                    this.render();
                }
            }
        }, 'gameDemo-feedback');
    }
    private heading(p: Node, h: number, title: string, subtitle: string): void {
        text(p, title, 0, h / 2 - 180, 680, 44, gold);
        text(p, subtitle, 0, h / 2 - 240, 680, 24, muted);
    }
    private shop(p: Node, h: number, l: GameDemoLogic): void {
        const items = l.assets?.items;
        (['herb', 'dew'] as const).forEach((id, i) => {
            const cfg = GAME_DEMO_CONFIG.shop[i];
            const y = h / 2 - 390 - i * 260;
            plate(p, 0, y, 670, 228);
            plate(p, -243, y + 22, 110, 110);
            text(p, i ? '露' : '草', -243, y + 22, 90, 55, i ? gold : jade);
            text(p, cfg.name, -25, y + 55, 285, 34, jade, Label.HorizontalAlign.LEFT);
            text(
                p,
                `持有 ${items?.[id] ?? 0}  ·  每份 ${cfg.price} 灵石`,
                35,
                y + 6,
                410,
                24,
                muted,
                Label.HorizontalAlign.LEFT,
            );
            button(
                p,
                `购买 ×10 · ${cfg.price * 10} 灵石`,
                45,
                y - 63,
                475,
                () => this.act(() => l.buy(id)),
                true,
            );
        });
        text(
            p,
            `经验丹 ${items?.pill ?? 0}    极品丹 ${items?.finePill ?? 0}`,
            0,
            -h / 2 + 420,
            650,
            26,
            muted,
        );
        button(
            p,
            l.assets?.initialized ? '测试资源已领取' : '领取一次性测试资源',
            0,
            -h / 2 + 310,
            660,
            () => this.act(() => l.initialize()),
            !l.assets?.initialized,
            88,
            !l.assets?.initialized,
        );
        button(p, '刷新商店', 0, -h / 2 + 210, 660, () => this.act(() => l.refresh()));
    }
    private hero(p: Node, h: number, l: GameDemoLogic): void {
        const hero = l.heroState?.hero;
        const y = h / 2 - 480;
        plate(p, 0, y, 670, 350);
        const g = node(p, '修士画像', -190, y + 15).addComponent(Graphics);
        avatar(g, 0, 0, 93);
        text(p, `御剑修士`, 105, y + 105, 290, 32, gold);
        text(p, `Lv. ${hero?.level ?? 1}`, 105, y + 43, 290, 48, jade);
        text(p, `攻击力  ${hero?.attack ?? '—'}`, 105, y - 25, 290, 28);
        bar(p, 80, y - 85, 360, 14)(hero ? hero.exp / GAME_DEMO_CONFIG.heroExpPerLevel : 0);
        text(p, `经验 ${hero?.exp ?? 0}/${GAME_DEMO_CONFIG.heroExpPerLevel}`, 80, y - 119, 360, 22, muted);
        text(
            p,
            `经验丹 ${l.assets?.items.pill ?? 0}    极品丹 ${l.assets?.items.finePill ?? 0}`,
            0,
            y - 230,
            650,
            27,
            gold,
        );
        (['normal', 'fine'] as const).forEach((kind, i) => {
            const y2 = -h / 2 + 410 - i * 112;
            icon(p, 'pill', -304, y2, 32, i ? gold : jade);
            text(p, i ? '极品丹' : '经验丹', -225, y2, 120, 26);
            button(
                p,
                '使用 ×1',
                -25,
                y2,
                210,
                () => this.act(() => l.upgrade(kind, 1)),
                true,
            );
            button(p, '使用 ×10', 210, y2, 220, () => this.act(() => l.upgrade(kind, 10)));
        });
        const go = button(p, '前往炼丹', 0, -h / 2 + 200, 660, () => this.act(() => l.selectPage('alchemy')));
        icon(go.getChildByName('button-skin')!, 'alchemy', -114, 2, 33);
        icon(go.getChildByName('button-skin')!, 'arrow', 114, 2, 33);
    }
    private alchemy(p: Node, h: number, l: GameDemoLogic): void {
        const batch = l.alchemyState?.batch;
        const animating = l.alchemyAnimationRemaining > 0;
        const y = h / 2 - 455;
        plate(p, 0, y, 670, 335);
        const g = node(p, '丹炉', 0, y + 22).addComponent(Graphics);
        circle(g, 0, 0, 94, gold);
        circle(g, 0, 0, 79, ink);
        circle(g, 0, 0, 49, jade);
        text(p, '丹', 0, y + 22, 130, 58, white);
        text(
            p,
            animating
                ? `正在炼制 ${batch?.count ?? 0} 炉 · ${Math.ceil(l.alchemyAnimationRemaining / 1000)} 秒`
                : batch
                  ? `成品已收入行囊 · 经验丹 ${batch.pill} / 极品丹 ${batch.finePill}`
                  : '丹火待燃 · 选择炉数',
            0,
            y - 110,
            600,
            28,
            gold,
        );
        text(
            p,
            `灵草 ${l.assets?.items.herb ?? 0}    灵露 ${l.assets?.items.dew ?? 0}\n每炉消耗 ${GAME_DEMO_CONFIG.alchemy.herbPerBatch} 草 ${GAME_DEMO_CONFIG.alchemy.dewPerBatch} 露\n整批固定 ${GAME_DEMO_CONFIG.alchemy.animationMs / 1000} 秒，数量不增加耗时`,
            0,
            y - 245,
            650,
            27,
            muted,
            Label.HorizontalAlign.CENTER,
            132,
        );
        if (animating || l.busy) {
            const progress = bar(p, 0, -h / 2 + 425, 620, 18);
            progress(animating ? 1 - l.alchemyAnimationRemaining / GAME_DEMO_CONFIG.alchemy.animationMs : 0);
            if (animating) this.alchemyVisual = { flame: g.node, progress };
            button(p, animating ? '丹火正旺…' : '正在提交…', 0, -h / 2 + 365, 660, () => {}, true, 88, false);
        } else {
            button(p, '炼制 1 炉', -173, -h / 2 + 365, 310, () => this.act(() => l.startAlchemy(1)), true);
            button(p, '炼制 5 炉', 173, -h / 2 + 365, 310, () => this.act(() => l.startAlchemy(5)), true);
        }
        button(p, '查看炼丹盛会', 0, -h / 2 + 195, 660, () => this.act(() => l.selectPage('season')));
    }
    private bosses(p: Node, h: number, l: GameDemoLogic): void {
        (l.bossList?.rooms ?? []).forEach((room, i) => {
            const y = h / 2 - 398 - i * 262;
            plate(p, 0, y, 670, 234);
            text(p, room.name, -190, y + 57, 220, 40, i === 1 ? jade : gold);
            text(p, room.phase === 'running' ? '可挑战' : '等待下一局', 145, y + 57, 280, 23, muted);
            bar(p, 0, y + 2, 600, 11)(room.hp / room.maxHp);
            text(p, `${room.hp} / ${room.maxHp}`, 0, y - 27, 600, 21, muted);
            button(
                p,
                `进入${room.name}秘境`,
                0,
                y - 80,
                600,
                () => this.act(() => l.enterBoss(room.bossId)),
                true,
                76,
            );
        });
    }
    private season(p: Node, h: number, l: GameDemoLogic): void {
        const state = l.seasonState;
        plate(p, 0, h / 2 - 355, 670, 150);
        text(
            p,
            `我的积分 ${state?.myScore ?? 0}    ${state?.myRank ? '第 ' + state.myRank + ' 名' : '尚未上榜'}`,
            0,
            h / 2 - 332,
            620,
            30,
            gold,
        );
        text(
            p,
            state?.phase === 'running'
                ? `活动剩余 ${Math.max(0, Math.ceil((state.endsAt - state.serverNow) / 1000))} 秒（刷新更新）`
                : state?.phase === 'settling'
                  ? '奖励结算中'
                  : '奖励已投递，请查收邮件',
            0,
            h / 2 - 387,
            620,
            23,
            muted,
        );
        const rows = state?.top.slice(l.rankPage * 5, l.rankPage * 5 + 5) ?? [];
        rows.forEach((r, i) => {
            const y = h / 2 - 500 - i * 85;
            plate(p, 0, y, 670, 76);
            text(p, String(r.rank), -278, y, 70, 30, gold);
            text(p, String(r.uid), -15, y, 390, 24);
            text(p, String(r.score), 252, y, 125, 30, jade);
        });
        if (!rows.length) text(p, '尚无人上榜，炼出第一炉灵丹吧', 0, h / 2 - 595, 650, 27, muted);
        button(p, '上一页', -170, -h / 2 + 390, 315, () => l.turnRankPage(-1));
        button(p, '下一页', 170, -h / 2 + 390, 315, () => l.turnRankPage(1));
        button(p, '开发：提前结束活动', 0, -h / 2 + 295, 660, () => this.act(() => l.endSeason()));
        button(p, '查看奖励邮件', 0, -h / 2 + 200, 660, () => this.act(() => l.selectPage('mail')), true);
    }
    private guild(p: Node, h: number, l: GameDemoLogic): void {
        const state = l.guildState;
        const guild = state?.guild;
        text(p, `我的 ID：${state?.uid ?? '—'}`, 0, h / 2 - 305, 650, 21, muted);
        if (guild) {
            plate(p, 0, h / 2 - 495, 670, 290);
            text(p, guild.name, 0, h / 2 - 398, 600, 36, gold);
            text(
                p,
                `${guild.members.length}/${GAME_DEMO_CONFIG.guildCapacity} 人`,
                0,
                h / 2 - 450,
                600,
                24,
                jade,
            );
            text(
                p,
                guild.members.map((uid) => `${uid === guild.owner ? '盟主' : '成员'}  ${uid}`).join('\n'),
                0,
                h / 2 - 550,
                590,
                23,
                muted,
                Label.HorizontalAlign.CENTER,
                145,
            );
            if (guild.owner === state?.uid) {
                input(p, l.inviteTarget, '输入目标玩家 ID', -h / 2 + 470, 128, (v) => {
                    l.inviteTarget = v;
                });
                button(
                    p,
                    '邀请入盟',
                    0,
                    -h / 2 + 355,
                    630,
                    () => this.act(() => l.guildAction('invite')),
                    true,
                );
            }
            button(p, '离开仙盟', 0, -h / 2 + 210, 630, () => this.act(() => l.guildAction('leave')));
        } else {
            input(p, l.guildName, '输入仙盟名称', h / 2 - 390, 16, (v) => {
                l.guildName = v;
            });
            button(p, '创建仙盟', 0, h / 2 - 500, 630, () => this.act(() => l.guildAction('create')), true);
            text(p, `待处理邀请 ${state?.invitations.length ?? 0}`, 0, h / 2 - 600, 650, 28, gold);
            (state?.invitations.slice(l.invitePage * 2, l.invitePage * 2 + 2) ?? []).forEach((invite, i) => {
                const y = h / 2 - 735 - i * 175;
                plate(p, 0, y, 670, 155);
                text(p, invite.guildName, -158, y, 270, 28);
                button(p, '接受', 81, y, 135, () => this.act(() => l.guildAction('accept', invite.id)), true);
                button(p, '拒绝', 245, y, 135, () => this.act(() => l.guildAction('reject', invite.id)));
            });
            button(p, '上一页', -170, -h / 2 + 200, 310, () => l.turnInvitePage(-1));
            button(p, '下一页', 170, -h / 2 + 200, 310, () => l.turnInvitePage(1));
        }
        button(p, '刷新', 280, h / 2 - 180, 120, () => this.act(() => l.refresh()), false, 72);
    }
    private mail(p: Node, h: number, l: GameDemoLogic): void {
        const mails = l.mails.slice(l.mailPage * 5, l.mailPage * 5 + 5);
        if (!mails.length)
            text(
                p,
                '暂无线笺\n挑战 Boss 或参与盛会后再来看看',
                0,
                50,
                650,
                30,
                muted,
                Label.HorizontalAlign.CENTER,
                120,
            );
        mails.forEach((mail, i) => {
            const y = h / 2 - 375 - i * 157;
            const row = plate(p, 0, y, 670, 140);
            text(row, mail.title, -90, 28, 440, 25, gold);
            text(row, `${mail.gold} 灵石 · ${mail.read ? '已读' : '未读'}`, -90, -29, 440, 22, muted);
            row.on(Node.EventType.TOUCH_END, () => this.act(() => l.mailAction(mail.id, false)));
            button(
                row,
                mail.claimed ? '已领取' : '领取',
                245,
                0,
                140,
                () => {
                    if (!mail.claimed) this.act(() => l.mailAction(mail.id, true));
                },
                !mail.claimed,
                88,
                !mail.claimed,
            );
        });
        button(p, '上一页', -170, -h / 2 + 195, 310, () => l.turnMailPage(-1));
        button(p, '下一页', 170, -h / 2 + 195, 310, () => l.turnMailPage(1));
        button(p, '刷新', 280, h / 2 - 180, 120, () => this.act(() => l.refresh()), false, 72);
    }
}
