/** Copyable TSX examples for the shared components shown in the catalog. */
export const componentUsage: Readonly<Record<string, string>> = {
    "cmp-confirm": '<ActionButton skin={confirmSkin} theme={theme} label="确定" width={210} height={92} onClick={onClick} />',
    "cmp-cancel": '<ActionButton skin={cancelSkin} theme={theme} label="取消" width={210} height={92} onClick={onClick} />',
    "cmp-cyan": '<ActionButton skin={cyanSkin} theme={theme} label="前往" width={210} height={92} onClick={onClick} />',
    "cmp-red": '<ActionButton skin={redSkin} theme={theme} label="删除已读" width={210} height={92} onClick={onClick} />',
    "cmp-yellow": '<ActionButton skin={yellowSkin} theme={theme} label="确定" width={210} height={92} onClick={onClick} />',
    "cmp-back": '<ActionButton skin={backSkin} theme={theme} width={64} height={56} accessibilityLabel="返回" onClick={onClick} />',
    "cmp-close": '<ActionButton skin={closeSkin} theme={theme} width={72} height={72} imageInset={closeInset} onClick={onClick} />',
    "cmp-icon": '<IconCaptionButton theme={theme} icon={gearIcon} label="图标按钮" left={0} top={0} width={210} iconWidth={48} iconHeight={48} onClick={onClick} />',
    "cmp-menu": '<WideMenuButton theme={theme} icon={gearIcon} iconWidth={46} iconHeight={46} label="宽菜单" left={0} top={0} labelWidth={160} onClick={onClick} />',
    "cmp-tabs": '<TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={15} itemWidth={190} gap={14} width={674} skin={tabSkin} onSelect={setSelectedTab} />',
    "cmp-tab-character": '<TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={8} itemWidth={195} gap={25} width={674} skin={tabSkin} onSelect={setSelectedTab} />',
    "cmp-tab-hero-list": '<TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={14} itemWidth={227} gap={0} width={681} skin={tabSkin} onSelect={setSelectedTab} />',
    "cmp-tab-hero-detail": '<TabBar theme={theme} items={TABS} selected={selectedTab} left={0} top={0} itemWidth={225} gap={-14} width={647} skin={tabSkin} onSelect={setSelectedTab} />',
    "cmp-badge": '<NotificationBadge theme={theme} mode="count" count={8} left={0} top={0} />',
    "cmp-dot": '<NotificationBadge theme={theme} mode="dot" visible left={6} top={6} />',
    "cmp-input": '<InputText theme={theme} left={0} top={0} width={290} height={56} value={input} placeholder="请输入" onInput={setInput} />',
    "cmp-dropdown": '<Dropdown items={DROPDOWN_ITEMS} selected={dropdownValue} skin={dropdownSkin} left={20} top={16} onSelect={setDropdownValue} />',
    "cmp-empty": '<EmptyState theme={theme} left={283} top={4} label="空状态" labelLeft={232} labelTop={124} labelWidth={210} />',
    "cmp-progress": '<ProgressBar theme={theme} left={0} top={0} width={674} height={34} value={72} max={100} label="72%" />',
    "cmp-marquee": '<Marquee text="联盟活动即将开始，请各位成员做好准备！" left={0} top={0} width={674} height={56} font={font} fontSize={26} color={pageText} backgroundColor={pageSurfaceAlt} />',
    "cmp-countdown-days": '<Countdown target={targetIso} format="D天 HH:mm:ss" left={0} top={0} width={360} height={56} font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />',
    "cmp-countdown-hours": '<Countdown durationSeconds={3 * 3600 + 4 * 60 + 5} left={0} top={0} width={360} height={56} font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />',
    "cmp-countdown-minutes": '<Countdown durationSeconds={5 * 60 + 30} format="mm:ss" left={0} top={0} width={360} height={56} font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />',
    "cmp-countdown-chinese": '<Countdown durationSeconds={86400 + 2 * 3600 + 3 * 60 + 4} format="D天HH时mm分ss秒" left={0} top={0} width={360} height={56} font={font} fontSize={28} color={pageText} backgroundColor={pageSurfaceAlt} />',
    "cmp-floating-text": '<FloatingHintQueue items={hints} onComplete={completeHint} idleText="+1200 经验" idleTextWidth={200} left={187} top={74} width={300} height={50} font={font} fontSize={32} />',
    "cmp-floating-icon-text": '<FloatingHintQueue items={hints} onComplete={completeHint} idleText="+50 宝石" idleIcon={gemIcon} idleTextWidth={160} left={187} top={74} width={300} height={50} font={font} fontSize={32} />',
    "cmp-check": '<CheckBox theme={theme} checked={checked} size={44} hitSize={60} />',
    "cmp-radio": '<CheckBox theme={theme} checked={selected === "a"} size={44} hitSize={60} />',
    "cmp-quantity": '<QuantityControl theme={theme} left={0} top={0} value={quantity} max={9} skin={QUANTITY_LAYOUT} onChange={setQuantity} />',
    "cmp-slot": '<ItemSlot theme={theme} left={0} top={0} itemId="cube" count="12" />',
    "cmp-resource": '<ResourceCounter theme={theme} icon={gemIcon} left={0} top={0} value="12.8K" />',
    "cmp-stars": '<StarLevel value={3} />',
    "cmp-star-row": '<StarRow value={6} />',
    "cmp-tech": '<TechIcon left={0} top={0} kind="heart" level="1/3" />',
    "cmp-reward": '<RewardItem item={{ id: "gem", itemId: "gem", count: "30000", left: 0, top: 0 }} />',
    "cmp-header": '<ScreenHeader theme={theme} title="页面标题" />',
    "cmp-footer": '<ScreenFooter theme={theme} onBack={onBack} />',
    "cmp-nav": '<MainNav theme={theme} selected={navigation} noticeExplore onSelect={setNavigation} />',
    "cmp-popup": '<PopupFrame theme={theme} title="主题弹窗" left={21} top={12} onClose={onClose} />',
};

/** Break a self-closing JSX example between props, preserving strings and nested expressions. */
export function formatComponentUsage(source: string): string {
    const match = /^<([A-Za-z][\w]*)([\s\S]*?)\s*\/>$/.exec(source.trim());
    if (!match) return source.trim();
    const attributes = match[2].trim();
    if (!attributes) return `<${match[1]} />`;
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < attributes.length; i += 1) {
        const char = attributes[i];
        if (quote) {
            if (char === "\\") i += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        else if (/\s/.test(char) && depth === 0) {
            if (start < i) parts.push(attributes.slice(start, i));
            while (i + 1 < attributes.length && /\s/.test(attributes[i + 1])) i += 1;
            start = i + 1;
        }
    }
    if (start < attributes.length) parts.push(attributes.slice(start));
    return `<${match[1]}\n${parts.map((part) => `  ${part}`).join("\n")}\n/>`;
}
