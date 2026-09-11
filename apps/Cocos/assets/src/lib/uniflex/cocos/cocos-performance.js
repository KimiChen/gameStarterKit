import { director, Director, sys } from 'cc';
import { ArrayVirtualListDataSource } from '../core/virtual-data-source.js';
import { defineCompiledComponent } from '../core/runtime.js';
/**
 * Explicit real-engine benchmark. It only runs when MainBootstrap sees ?perf=1,
 * so normal scenes pay no node or frame cost for the suite.
 */
export async function runCocosPerformanceSuite(provider, signal) {
    const nodeCount = 1000;
    const measuredTextLeaves = 100;
    const component = makeComponent(nodeCount);
    const mountStarted = now();
    const handle = provider.mount(component, { tick: 0, gap: 2 });
    const mountMs = now() - mountStarted;
    try {
        for (let index = 0; index < 10; index++) {
            handle.update({ tick: 0, gap: index % 2 === 0 ? 2 : 3 });
            handle.flushNow();
        }
        await nextFrame(signal);
        const totalSamples = [];
        const layoutSamples = [];
        const writebackSamples = [];
        for (let index = 0; index < 60; index++) {
            const started = now();
            handle.update({
                tick: index % 10 === 0 ? index : Math.floor(index / 10) * 10,
                gap: index % 2 === 0 ? 2 : 3,
            });
            handle.flushNow();
            totalSamples.push(now() - started);
            layoutSamples.push(handle.metrics.layout.layoutMs);
            writebackSamples.push(handle.metrics.layout.writebackMs);
            if (index % 10 === 9)
                await nextFrame(signal);
        }
        await nextFrame(signal);
        const commitsBeforeIdle = handle.metrics.runtime.commits;
        const layoutsBeforeIdle = handle.metrics.layout.layoutPasses;
        await nextFrames(30, signal);
        const idleCommits = handle.metrics.runtime.commits - commitsBeforeIdle;
        const idleLayouts = handle.metrics.layout.layoutPasses - layoutsBeforeIdle;
        const metrics = [
            metric('cold mount 1k', mountMs, 'ms', 250),
            metric('retained update p50', percentile(totalSamples, 0.5), 'ms'),
            metric('retained update p95', percentile(totalSamples, 0.95), 'ms', 16.7),
            metric('layout p95', percentile(layoutSamples, 0.95), 'ms', 8),
            metric('writeback p95', percentile(writebackSamples, 0.95), 'ms', 8),
            metric('idle commits 30 frames', idleCommits, 'count', 0),
            metric('idle layouts 30 frames', idleLayouts, 'count', 0),
            metric('latest measured leaves', handle.metrics.layout.measuredLeaves, 'count'),
        ];
        const runtime = Object.assign({}, handle.metrics.runtime);
        handle.destroy();
        const initialWindows = await checkInitialWindows(provider, signal);
        metrics.push(metric('initial window burst violations', initialWindows.reduce((sum, w) => sum + w.burstViolations, 0), 'count', 0));
        metrics.push(metric('initial window interval violations', initialWindows.reduce((sum, w) => sum + w.intervalViolations, 0), 'count', 0));
        const report = {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            platform: String(sys.platform),
            nodeCount,
            measuredTextLeaves,
            metrics,
            runtime,
            initialWindows,
        };
        console.info(`[cocos-perf] ${JSON.stringify(report)}`);
        return report;
    }
    finally {
        handle.destroy();
    }
}
/** Real native Host path, isolated from the eager 1k regression budget above. */
async function checkInitialWindows(provider, signal) {
    const reports = [];
    for (const layout of ['list', 'regular', 'masonry']) {
        for (const direction of ['vertical', 'horizontal']) {
            for (const animation of [true, false]) {
                const source = new ArrayVirtualListDataSource(Array.from({ length: 1000 }, (_, id) => ({ id })));
                const controller = { current: null };
                const seen = new Set(), times = [];
                const start = now();
                const component = defineCompiledComponent({
                    version: 5,
                    name: 'InitialWindowProbe',
                    slotCount: 2,
                    root: {
                        planId: 1,
                        kind: 'virtual-list',
                        props: {
                            name: `InitialWindow-${layout}-${direction}-${animation}`,
                            initialRender: { animation },
                            direction,
                            style: { width: 288, height: 288 },
                            itemSize: 72,
                            lanes: 3,
                            mode: layout === 'masonry' ? 'masonry' : 'regular',
                            overscan: 0,
                        },
                        bindings: [{ slot: 1, property: 'controller' }],
                        virtual: {
                            sourceSlot: 0,
                            key: 'id',
                            layout: layout === 'list' ? 'list' : 'grid',
                            itemSlotCount: 1,
                            template: {
                                planId: 2,
                                kind: 'view',
                                behavior: { interaction: 'press' },
                                props: {
                                    style: { width: '100%', height: '100%' },
                                    backgroundColor: '#265dcc',
                                },
                                children: [
                                    {
                                        planId: 3,
                                        kind: 'text',
                                        props: {
                                            fontSize: 20,
                                            style: { width: 72, height: 40 },
                                        },
                                        bindings: [{ slot: 0, property: 'value' }],
                                    },
                                ],
                            },
                        },
                    },
                }, (_, slots) => {
                    slots[0] = source;
                    slots[1] = controller;
                }, {
                    1: (items, _indices, slots) => {
                        const id = items[0].id;
                        // The first evaluation is immediately before this actual native row is allocated.
                        if (!seen.has(id)) {
                            seen.add(id);
                            times.push(now() - start);
                        }
                        slots[0] = `cell ${id}`;
                    },
                });
                const mounted = provider.mount(component, {});
                try {
                    const firstItems = controller.current.getMetrics().physicalSlots;
                    let nodes = mounted.metrics.runtime.nodesCreated, items = firstItems;
                    const frames = [];
                    for (let frame = 0; frame < 180; frame++) {
                        await nextFrame(signal);
                        const nextNodes = mounted.metrics.runtime.nodesCreated, nextItems = controller.current.getMetrics().physicalSlots;
                        frames.push({
                            timeMs: now() - start,
                            addedNodes: nextNodes - nodes,
                            addedItems: nextItems - items,
                        });
                        nodes = nextNodes;
                        items = nextItems;
                        const range = controller.current.getVisibleRange();
                        if (items >= range.end - range.start &&
                            frames[frames.length - 1].timeMs > times[times.length - 1] + 200)
                            break;
                    }
                    reports.push({
                        name: `${layout}-${direction}`,
                        animation,
                        firstItems,
                        creationTimesMs: times,
                        frames,
                        burstViolations: Number(firstItems !== 1) +
                            frames.filter((frame) => frame.addedItems > 1 || frame.addedNodes > 2)
                                .length,
                        intervalViolations: times.slice(1).filter((time, i) => time - times[i] < 32)
                            .length,
                    });
                }
                finally {
                    mounted.destroy();
                }
            }
        }
    }
    return reports;
}
function makeComponent(nodeCount) {
    let nextPlanId = 1;
    let firstText = true;
    const children = Array.from({ length: nodeCount - 1 }, (_, index) => {
        const isText = index % 10 === 0;
        const bindings = isText && firstText ? [{ slot: 1, property: 'value' }] : undefined;
        if (isText && firstText)
            firstText = false;
        return {
            planId: nextPlanId++,
            kind: isText ? 'text' : 'view',
            props: isText
                ? {
                    style: { width: 120, height: 'auto', flexShrink: 0 },
                    value: `Measured label ${index}: retained Cocos text wrapping`,
                    fontSize: 16,
                    lineHeight: 20,
                    wrap: true,
                }
                : { style: { width: 18 + (index % 7), height: 18 + (index % 5), flexShrink: 0 } },
            bindings,
        };
    });
    const plan = {
        version: 5,
        name: 'CocosPerformanceSynthetic',
        slotCount: 2,
        root: {
            planId: nextPlanId++,
            kind: 'view',
            props: {
                style: { width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap' },
            },
            bindings: [{ slot: 0, property: 'style' }],
            children,
        },
    };
    return defineCompiledComponent(plan, (props, slots) => {
        slots[0] = {
            width: '100%',
            height: '100%',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignContent: 'flexStart',
            gap: props.gap,
        };
        slots[1] = `Measured dynamic label ${props.tick}: retained Cocos text wrapping`;
    });
}
function metric(name, value, unit, budgetMax) {
    return {
        name,
        value,
        unit,
        budgetMax,
        status: budgetMax === undefined ? 'INFO' : value <= budgetMax ? 'PASS' : 'WARN',
    };
}
function percentile(values, ratio) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
function nextFrame(signal) {
    return new Promise((resolve, reject) => {
        var _a;
        let unsubscribe = () => { };
        const cleanup = () => {
            director.off(Director.EVENT_AFTER_UPDATE, done);
            unsubscribe();
        };
        const done = () => {
            cleanup();
            resolve();
        };
        const abort = () => {
            cleanup();
            reject(new Error('Performance run cancelled.'));
        };
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
            abort();
            return;
        }
        unsubscribe = (_a = signal === null || signal === void 0 ? void 0 : signal.subscribe(abort)) !== null && _a !== void 0 ? _a : unsubscribe;
        director.once(Director.EVENT_AFTER_UPDATE, done);
    });
}
async function nextFrames(count, signal) {
    for (let index = 0; index < count; index++)
        await nextFrame(signal);
}
function now() {
    var _a, _b;
    var _c;
    return (_c = (_b = (_a = globalThis.performance) === null || _a === void 0 ? void 0 : _a.now) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : Date.now();
}
