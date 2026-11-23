import { anchorPoint, defaultAnchor } from './organizationChartGeometry.ts';
import type { EdgeRoute, CardGeometry, Point, EdgeAnchor } from './organizationChartGeometry.ts';
export type LayoutNode = { username: string; tier: string; leader_ids: string[] };
export type CanvasSize = { width: number; height: number };
export type CanvasExtent = { left: number; top: number; right: number; bottom: number };
export const CARD_WIDTH = 230;
export const CARD_HEIGHT = 132;
export const CANVAS_PADDING = 24;
export const tiers = ['store_manager', 'chief_operation', 'supervisor', 'service_crew'];

export function radialAnchor(card: CardGeometry, target: Point): EdgeAnchor {
    const anchor = defaultAnchor(card, target);
    const dx = target.x - card.centerX, dy = target.y - card.centerY;
    if (anchor.side === 'left' || anchor.side === 'right') {
        anchor.position = Math.max(0, Math.min(1, (card.centerY + dy * (card.right - card.left) / 2 / Math.max(0.001, Math.abs(dx)) - card.top) / (card.bottom - card.top)));
    } else {
        anchor.position = Math.max(0, Math.min(1, (card.centerX + dx * (card.bottom - card.top) / 2 / Math.max(0.001, Math.abs(dy)) - card.left) / (card.right - card.left)));
    }
    return anchor;
}

// Small teams use two balanced columns; larger legacy layouts retain compact layers.
export function starLayout(nodes: LayoutNode[]) {
    const positions: Record<string, { left: number; top: number }> = {};
    const supervisors = nodes.filter((n) => n.tier === 'supervisor');
    const crew = nodes.filter((n) => n.tier === 'service_crew');
    const assigned = new Set<string>();
    const hubs = supervisors.length ? supervisors : [{ username: '', tier: 'supervisor', leader_ids: [] }];
    let width = 900;
    let height = 760;
    let cursor = CANVAS_PADDING;
    for (const hub of hubs) {
        const members = crew.filter((n) => !assigned.has(n.username) && (!hub.username || n.leader_ids.includes(hub.username)));
        members.forEach((n) => assigned.add(n.username));
        const stepX = CARD_WIDTH + (members.length <= 8 ? 80 : 28), stepY = CARD_HEIGHT + 28;
        const slots: { x: number; y: number }[] = [];
        if (members.length <= 8) {
            const left = Math.ceil(members.length / 2), right = Math.floor(members.length / 2);
            members.forEach((_, index) => {
                const onLeft = index % 2 === 0, count = onLeft ? left : right;
                slots.push({ x: onLeft ? -1 : 1, y: Math.floor(index / 2) - (count - 1) / 2 });
            });
        } else {
            for (let layer = 1; slots.length < members.length; layer++) {
                // Alternate sides; keep the upper central column for ancestors.
                for (let y = 0; y <= layer; y++) slots.push({ x: -layer, y }, { x: layer, y });
                for (let x = -layer + 1; x < layer; x++) slots.push({ x, y: layer });
                for (let y = -1; y >= -layer; y--) slots.push({ x: -layer, y }, { x: layer, y });
                for (let x = 1; x < layer; x++) slots.push({ x: -x, y: -layer }, { x, y: -layer });
            }
        }
        const used = slots.slice(0, members.length);
        const minX = Math.min(0, ...used.map((p) => p.x));
        const maxX = Math.max(0, ...used.map((p) => p.x));
        const minY = Math.min(-2, ...used.map((p) => p.y));
        const hubX = cursor - minX * stepX;
        const hubY = CANVAS_PADDING - minY * stepY;
        if (hub.username) positions[hub.username] = { left: hubX, top: hubY };
        members.forEach((member, index) => {
            positions[member.username] = { left: hubX + used[index].x * stepX, top: hubY + used[index].y * stepY };
        });
        cursor += (maxX - minX) * stepX + CARD_WIDTH + 80;
        height = Math.max(height, hubY + Math.max(0, ...used.map((p) => p.y)) * stepY + CARD_HEIGHT + CANVAS_PADDING);
    }
    const packedWidth = cursor - 80 + CANVAS_PADDING;
    width = Math.max(width, packedWidth);
    for (const tier of ['store_manager', 'chief_operation']) width = Math.max(width, nodes.filter((n) => n.tier === tier).length * (CARD_WIDTH + 32) + CANVAS_PADDING * 2);
    Object.values(positions).forEach((p) => { p.left += (width - packedWidth) / 2; });
    for (const tier of ['store_manager', 'chief_operation']) {
        const leaders = nodes.filter((n) => n.tier === tier);
        leaders.forEach((n, i) => {
            positions[n.username] = { left: (width - CARD_WIDTH) * (i + 1) / (leaders.length + 1), top: tier === 'store_manager' ? 24 : 184 };
        });
    }
    const orphans = crew.filter((n) => !assigned.has(n.username));
    orphans.forEach((n, i) => {
        positions[n.username] = { left: CANVAS_PADDING + (i % 4) * (CARD_WIDTH + 32), top: height + Math.floor(i / 4) * (CARD_HEIGHT + 32) };
    });
    if (orphans.length) { width = Math.max(width, 1100); height += Math.ceil(orphans.length / 4) * (CARD_HEIGHT + 32); }
    return { positions, width: Math.ceil(width), height: Math.ceil(height) };
}

export function columnStarRoute(leader: CardGeometry, subordinate: CardGeometry, index: number, count: number): EdgeRoute {
    const left = subordinate.centerX < leader.centerX;
    return { points: [], start_anchor: { side: left ? 'left' : 'right', position: (index + 1) / (count + 1) },
        end_anchor: { side: left ? 'right' : 'left', position: 0.5 } };
}

export function legacyCanvas(nodes: LayoutNode[], viewportWidth: number): CanvasSize {
    const largestTier = Math.max(1, ...tiers.map((tier) => nodes.filter((n) => n.tier === tier).length));
    return { width: Math.max(900, viewportWidth, largestTier * (CARD_WIDTH + 32) + CANVAS_PADDING * 2), height: 760 };
}

export function segmentCrossesCard(a: Point, b: Point, card: CardGeometry): boolean {
    let entry = 0, exit = 1;
    // Boundary contact is allowed; crossing a card's interior is not.
    for (const [start, delta, minimum, maximum] of [
        [a.x, b.x - a.x, card.left + 0.01, card.right - 0.01],
        [a.y, b.y - a.y, card.top + 0.01, card.bottom - 0.01],
    ]) {
        if (Math.abs(delta) < 0.000001) { if (start < minimum || start > maximum) return false; }
        else {
            const first = (minimum - start) / delta, last = (maximum - start) / delta;
            entry = Math.max(entry, Math.min(first, last)); exit = Math.min(exit, Math.max(first, last));
            if (entry > exit) return false;
        }
    }
    return true;
}

// Route through the 28px gaps between packed cards. Generated points remain
// editable using the existing handles.
export function compactRoute(leader: CardGeometry, subordinate: CardGeometry, obstacles: CardGeometry[], size: CanvasSize): EdgeRoute {
    const directStart = radialAnchor(leader, { x: subordinate.centerX, y: subordinate.centerY });
    const directEnd = radialAnchor(subordinate, { x: leader.centerX, y: leader.centerY });
    const clear = (points: Point[]) => points.slice(1).every((point, index) => !obstacles.some((card) => segmentCrossesCard(points[index], point, card)));
    if (clear([anchorPoint(leader, directStart), anchorPoint(subordinate, directEnd)])) return { points: [], start_anchor: directStart, end_anchor: directEnd };
    const sides = ['left', 'right', 'bottom', 'top'] as const;
    let best: { length: number; route: EdgeRoute } | null = null;
    for (const startSide of sides) for (const endSide of sides) {
        const startAnchor: EdgeAnchor = { side: startSide, position: 0.5 }, endAnchor: EdgeAnchor = { side: endSide, position: 0.5 };
        const start = anchorPoint(leader, startAnchor), end = anchorPoint(subordinate, endAnchor);
        const stub = (p: Point, side: string) => ({ x: p.x + (side === 'left' ? -14 : side === 'right' ? 14 : 0), y: p.y + (side === 'top' ? -14 : side === 'bottom' ? 14 : 0) });
        const source = stub(start, startSide), target = stub(end, endSide);
        const startHorizontal = startSide === 'left' || startSide === 'right';
        const endHorizontal = endSide === 'left' || endSide === 'right';
        const candidates: Point[][] = [];
        if (startHorizontal && endHorizontal) {
            for (const y of [subordinate.top - 14, subordinate.bottom + 14, leader.top - 14, leader.bottom + 14]) candidates.push([source, { x: source.x, y }, { x: target.x, y }, target]);
        } else if (!startHorizontal && !endHorizontal) {
            for (const x of [leader.left - 14, leader.right + 14, subordinate.left - 14, subordinate.right + 14]) candidates.push([source, { x, y: source.y }, { x, y: target.y }, target]);
        } else candidates.push([source, startHorizontal ? { x: source.x, y: target.y } : { x: target.x, y: source.y }, target]);
        for (const points of candidates) {
            const path = [start, ...points, end];
            if (!clear(path)) continue;
            const length = path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
            if (!best || length < best.length) best = { length, route: { start_anchor: startAnchor, end_anchor: endAnchor, points: points.map((p) => ({ x: p.x / size.width, y: p.y / size.height })) } };
        }
    }
    return best?.route || { points: [], start_anchor: directStart, end_anchor: directEnd };
}

export function convertLegacyNodes(nodes: LayoutNode[], saved: Record<string, { x: number; y: number }>, size: CanvasSize) {
    const active = tiers.filter((tier) => nodes.some((n) => n.tier === tier));
    const laneHeight = 760 / Math.max(1, active.length);
    return Object.fromEntries(nodes.map((node) => {
        const siblings = nodes.filter((n) => n.tier === node.tier);
        const position = saved[node.username] || { x: (siblings.indexOf(node) + 1) / (siblings.length + 1), y: 0.5 };
        const top = active.indexOf(node.tier) * laneHeight + 12 + position.y * Math.max(1, laneHeight - CARD_HEIGHT - 24);
        return [node.username, { x: position.x, y: (top - 12) / (size.height - CARD_HEIGHT - 24) }];
    }));
}

export function preserveLegacyRoutes(nodes: Record<string, { x: number; y: number }>, edges: { id: number; leader_id: string; subordinate_id: string }[], saved: Record<string, EdgeRoute>, size: CanvasSize) {
    const routes = { ...saved };
    const geometry = (id: string) => {
        const p = nodes[id];
        if (!p) return null;
        const left = CANVAS_PADDING + p.x * (size.width - CARD_WIDTH - CANVAS_PADDING * 2);
        const top = 12 + p.y * (size.height - CARD_HEIGHT - 24);
        return { left, top, right: left + CARD_WIDTH, bottom: top + CARD_HEIGHT, centerX: left + CARD_WIDTH / 2, centerY: top + CARD_HEIGHT / 2 };
    };
    edges.forEach((edge) => {
        if (routes[String(edge.id)]) return;
        const leader = geometry(edge.leader_id), subordinate = geometry(edge.subordinate_id);
        if (!leader || !subordinate) return;
        const outgoing = edges.filter((e) => e.leader_id === edge.leader_id);
        const incoming = edges.filter((e) => e.subordinate_id === edge.subordinate_id);
        const out = outgoing.findIndex((e) => e.id === edge.id) - (outgoing.length - 1) / 2;
        const into = incoming.findIndex((e) => e.id === edge.id) - (incoming.length - 1) / 2;
        const startAnchor = defaultAnchor(leader, { x: subordinate.centerX, y: subordinate.centerY }, out * 16);
        const endAnchor = defaultAnchor(subordinate, { x: leader.centerX, y: leader.centerY }, into * 16);
        const start = anchorPoint(leader, startAnchor), end = anchorPoint(subordinate, endAnchor);
        const horizontal = startAnchor.side === 'left' || startAnchor.side === 'right';
        const middle = horizontal ? (start.x + end.x) / 2 + (out + into) * 12 : (start.y + end.y) / 2 + (out + into) * 12;
        routes[String(edge.id)] = {
            start_anchor: startAnchor, end_anchor: endAnchor,
            points: horizontal
                ? [{ x: middle / size.width, y: start.y / size.height }, { x: middle / size.width, y: end.y / size.height }]
                : [{ x: start.x / size.width, y: middle / size.height }, { x: end.x / size.width, y: middle / size.height }],
        };
    });
    return routes;
}

export function fitNewMembers(nodes: LayoutNode[], saved: Record<string, { x: number; y: number }>, edges: Record<string, EdgeRoute>, size: CanvasSize) {
    const automatic = starLayout(nodes);
    if (!Object.keys(saved).length) return { nodes: saved, edges, canvas: { width: Math.max(size.width, automatic.width), height: Math.max(size.height, automatic.height) } };
    const positions = new Map(nodes.filter((n) => saved[n.username]).map((n) => {
        const p = saved[n.username];
        return [n.username, { left: CANVAS_PADDING + p.x * (size.width - CARD_WIDTH - CANVAS_PADDING * 2), top: 12 + p.y * (size.height - CARD_HEIGHT - 24) }];
    }));
    for (const node of nodes.filter((n) => !saved[n.username])) {
        const position = { ...automatic.positions[node.username] };
        while ([...positions.values()].some((p) => Math.abs(p.left - position.left) < CARD_WIDTH + 20 && Math.abs(p.top - position.top) < CARD_HEIGHT + 20)) position.top += CARD_HEIGHT + 32;
        positions.set(node.username, position);
    }
    const canvas = {
        width: Math.ceil(Math.max(size.width, ...[...positions.values()].map((p) => p.left + CARD_WIDTH + CANVAS_PADDING))),
        height: Math.ceil(Math.max(size.height, ...[...positions.values()].map((p) => p.top + CARD_HEIGHT + 12))),
    };
    return {
        canvas,
        nodes: Object.fromEntries([...positions].map(([id, p]) => [id, { x: (p.left - CANVAS_PADDING) / (canvas.width - CARD_WIDTH - CANVAS_PADDING * 2), y: (p.top - 12) / (canvas.height - CARD_HEIGHT - 24) }])),
        edges: Object.fromEntries(Object.entries(edges).map(([id, route]) => [id, { ...route, points: route.points.map((p) => ({ x: p.x * size.width / canvas.width, y: p.y * size.height / canvas.height })) }])),
    };
}

// Work in the gesture's original pixel coordinates. Rebasing every node and
// checkpoint together keeps their canvas positions stable during expansion.
export function growCanvasLayout(positions: Record<string, { left: number; top: number }>, routes: Record<string, EdgeRoute>, source: CanvasSize, previous: CanvasExtent, viewport: CanvasSize, cardSizes: Record<string, CanvasSize> = {}) {
    const extent = { ...previous, right: Math.max(previous.right, source.width, viewport.width), bottom: Math.max(previous.bottom, source.height, viewport.height) };
    const include = (left: number, top: number, right: number, bottom: number) => {
        if (left < extent.left) extent.left = Math.floor(left / 256) * 256;
        if (top < extent.top) extent.top = Math.floor(top / 256) * 256;
        if (right > extent.right) extent.right = Math.ceil(right / 256) * 256;
        if (bottom > extent.bottom) extent.bottom = Math.ceil(bottom / 256) * 256;
    };
    Object.entries(positions).forEach(([id, p]) => include(p.left - CANVAS_PADDING, p.top - 12, p.left + (cardSizes[id]?.width || CARD_WIDTH) + CANVAS_PADDING, p.top + (cardSizes[id]?.height || CARD_HEIGHT) + 12));
    Object.values(routes).forEach((route) => route.points.forEach((p) => include(p.x * source.width, p.y * source.height, p.x * source.width, p.y * source.height)));
    const shift = { x: -extent.left, y: -extent.top };
    const canvas = { width: Math.ceil(extent.right - extent.left), height: Math.ceil(extent.bottom - extent.top) };
    return {
        extent, shift, canvas,
        nodes: Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, {
            x: (p.left + shift.x - CANVAS_PADDING) / (canvas.width - CARD_WIDTH - CANVAS_PADDING * 2),
            y: (p.top + shift.y - 12) / (canvas.height - CARD_HEIGHT - 24),
        }])),
        routes: Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, { ...route, points: route.points.map((p) => ({ x: (p.x * source.width + shift.x) / canvas.width, y: (p.y * source.height + shift.y) / canvas.height })) }])),
    };
}
