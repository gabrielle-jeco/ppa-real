import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorPoint, createRouteMotion, defaultAnchor, moveCardConnection, moveEndpoint, moveWaypoint, routeFromMotion, sideToward } from '../src/general/organizationChartGeometry.ts';

const card = (left, top, width = 200, height = 100) => ({ left, right: left + width, top, bottom: top + height, centerX: left + width / 2, centerY: top + height / 2 });
const size = { width: 3000, height: 1000 };
const near = (actual, expected, tolerance = 0.00001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const fixture = (count = 2) => {
    const points = Array.from({ length: count }, (_, index) => ({ x: 1100 / size.width, y: (200 + 300 * (index + 1) / (count + 1)) / size.height }));
    return createRouteMotion({ points }, card(1000, 100), card(1000, 500), { side: 'bottom', position: 0.5 }, { side: 'top', position: 0.5 }, size);
};

test('moving a card within the current side leaves both endpoints and every checkpoint fixed', () => {
    for (const dx of [-80, -20, 0, 20, 80]) {
        const original = fixture();
        const moved = moveCardConnection(original, 'start', card(1000 + dx, 100));
        assert.deepEqual(moved.start.point, original.initialStart);
        assert.deepEqual(moved.end.point, original.initialEnd);
        assert.deepEqual(routeFromMotion(moved).points, original.route.points);
    }
});

test('after the moving card reaches its edge, the line slides across the other card while space remains', () => {
    const original = fixture();
    const moved = moveCardConnection(original, 'start', card(870, 100));
    assert.equal(moved.start.point.x, 1070);
    assert.equal(moved.end.point.x, 1070);
    assert.equal(moved.start.anchor.side, 'bottom');
    assert.equal(moved.end.anchor.side, 'top');
    const result = routeFromMotion(moved);
    result.points.forEach((point, index) => {
        near(point.x - original.route.points[index].x, -30 / size.width);
        near(point.y, original.route.points[index].y);
    });
});

test('once the opposite card also reaches its edge, checkpoint displacement becomes gradual', () => {
    const original = fixture(5);
    const moved = moveCardConnection(original, 'start', card(750, 100));
    assert.equal(moved.start.point.x, 950);
    assert.equal(moved.end.point.x, 1000);
    const deltas = routeFromMotion(moved).points.map((point, index) => original.route.points[index].x - point.x);
    for (let index = 1; index < deltas.length; index++) assert.ok(deltas[index - 1] > deltas[index]);
});

test('rectangular quadrants follow centre-to-corner diagonals, with stable ties', () => {
    const node = card(0, 0);
    assert.equal(sideToward(node, { x: 250, y: 130 }), 'bottom');
    assert.equal(sideToward(node, { x: 250, y: 120 }), 'right');
    assert.equal(sideToward(node, { x: 250, y: 125 }, 'bottom'), 'bottom');
    assert.equal(sideToward(node, { x: 250, y: 125 }, 'right'), 'right');
    assert.equal(sideToward(node, { x: -50, y: -30 }), 'top');
});

test('exhausted horizontal sliding hands off to left/right sides without detaching from either card', () => {
    for (const dx of [-900, 900]) {
        const moved = moveCardConnection(fixture(), 'start', card(1000 + dx, 100));
        assert.equal(moved.start.anchor.side, dx < 0 ? 'right' : 'left');
        assert.equal(moved.end.anchor.side, dx < 0 ? 'left' : 'right');
        assert.deepEqual(anchorPoint(moved.startCard, moved.start.anchor), moved.start.point);
        assert.deepEqual(anchorPoint(moved.endCard, moved.end.anchor), moved.end.point);
    }
});

test('left/right attachments provide the same fixed-then-sliding behaviour vertically', () => {
    const original = createRouteMotion({ points: [{ x: 0.4, y: 0.2 }] }, card(1000, 100, 100, 200), card(1400, 100, 100, 200),
        { side: 'right', position: 0.5 }, { side: 'left', position: 0.5 }, size);
    const free = moveCardConnection(original, 'start', card(1000, 40, 100, 200));
    assert.deepEqual(routeFromMotion(free).points, original.route.points);
    const pushed = moveCardConnection(original, 'start', card(1000, -40, 100, 200));
    assert.equal(pushed.start.point.y, 160);
    assert.equal(pushed.end.point.y, 160);
});

test('normal motion follows the card boundary and moves checkpoints using endpoint displacement', () => {
    const original = fixture();
    const moved = moveCardConnection(original, 'start', card(1000, 120));
    assert.equal(moved.start.point.y, 220);
    assert.equal(moved.end.point.y, 500);
    const result = routeFromMotion(moved);
    near(result.points[0].y - original.route.points[0].y, 20 * original.weights[0] / size.height);
    near(result.points[1].y - original.route.points[1].y, 20 * original.weights[1] / size.height);
});

test('many pointer events do not accumulate checkpoint drift', () => {
    const original = fixture(12);
    let moved = original;
    for (let dx = 1; dx <= 180; dx++) moved = moveCardConnection(moved, 'start', card(1000 - dx, 100));
    const direct = moveCardConnection(original, 'start', card(820, 100));
    assert.deepEqual(routeFromMotion(moved), routeFromMotion(direct));
});

test('reversing the card within its new available space keeps the displaced line pinned', () => {
    const moved = moveCardConnection(fixture(), 'start', card(870, 100));
    const reversed = moveCardConnection(moved, 'start', card(1000, 100));
    assert.deepEqual(reversed.start.point, moved.start.point);
    assert.deepEqual(reversed.end.point, moved.end.point);
    assert.deepEqual(routeFromMotion(reversed).points, routeFromMotion(moved).points);
});

test('manual endpoint dragging stays on its side, moves checkpoints gradually, and leaves the opposite endpoint fixed', () => {
    const original = fixture(5);
    const route = moveEndpoint(original, 'start', { x: 1150, y: 999 });
    assert.equal(route.start_anchor.side, 'bottom');
    assert.equal(route.start_anchor.position, 0.75);
    assert.deepEqual(route.end_anchor, original.end.anchor);
    const deltas = route.points.map((point, index) => point.x - original.route.points[index].x);
    for (let index = 1; index < deltas.length; index++) assert.ok(deltas[index - 1] > deltas[index]);
    route.points.forEach((point, index) => near(point.y, original.route.points[index].y));
});

test('moving the other endpoint reverses the gradual weighting', () => {
    const original = fixture(5);
    const route = moveEndpoint(original, 'end', { x: 1150, y: 999 });
    const deltas = route.points.map((point, index) => point.x - original.route.points[index].x);
    for (let index = 1; index < deltas.length; index++) assert.ok(deltas[index - 1] < deltas[index]);
    assert.deepEqual(route.start_anchor, original.start.anchor);
});

test('manual handles with checkpoints stay on their side and clamp to both corners', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
        const original = createRouteMotion({ points: [{ x: 0.5, y: 0.35 }] }, card(1000, 100), card(1000, 500), { side, position: 0.5 }, { side: 'top', position: 0.5 }, size);
        const first = moveEndpoint(original, 'start', { x: -999, y: -999 });
        const last = moveEndpoint(original, 'start', { x: 9999, y: 9999 });
        assert.equal(first.start_anchor.side, side);
        assert.equal(first.start_anchor.position, 0);
        assert.equal(last.start_anchor.position, 1);
    }
});

test('zero, two, three and one thousand checkpoints use the same endpoint weighting rule', () => {
    for (const count of [0, 2, 3, 1000]) {
        const original = fixture(count);
        const route = moveEndpoint(original, 'start', { x: 1150, y: 200 });
        assert.equal(route.points.length, count);
        route.points.forEach((point, index) => near(point.x - original.route.points[index].x, 50 * original.weights[index] / size.width));
        if (count > 1) assert.ok(route.points[0].x > route.points[count - 1].x);
    }
});

test('saving and reloading relative anchors preserves absolute endpoint placement', () => {
    const moved = moveCardConnection(fixture(), 'start', card(870, 100));
    const saved = JSON.parse(JSON.stringify(routeFromMotion(moved)));
    const reloaded = createRouteMotion(saved, moved.startCard, moved.endCard, saved.start_anchor, saved.end_anchor, size);
    assert.deepEqual(reloaded.start.point, moved.start.point);
    assert.deepEqual(reloaded.end.point, moved.end.point);
    assert.deepEqual(routeFromMotion(reloaded).points, saved.points);
});

test('legacy default attachments and large fan-out offsets stay on card boundaries', () => {
    const node = card(0, 0);
    for (const offset of [-1000, 0, 1000]) {
        const anchor = defaultAnchor(node, { x: 100, y: 500 }, offset);
        const point = anchorPoint(node, anchor);
        assert.ok(point.x >= node.left && point.x <= node.right);
        assert.equal(point.y, node.bottom);
    }
});

test('dragging the first checkpoint to the right changes a saved bottom anchor and keeps the grabbed point under the pointer', () => {
    const original = fixture();
    const moved = moveWaypoint(original, 0, { x: 1500, y: 150 });
    assert.deepEqual(moved.start_anchor, { side: 'right', position: 0.5 });
    assert.deepEqual(moved.end_anchor, original.end.anchor);
    assert.deepEqual(moved.points[0], { x: 0.5, y: 0.15 });
    near(moved.points[1].x - original.route.points[1].x, 100 * original.weights[1] / size.width);
    near(moved.points[1].y - original.route.points[1].y, -50 * original.weights[1] / size.height);
});

test('dragging the last checkpoint retargets the subordinate attachment and preserves the source attachment', () => {
    const original = fixture();
    const moved = moveWaypoint(original, 1, { x: 1500, y: 550 });
    assert.deepEqual(moved.end_anchor, { side: 'right', position: 0.5 });
    assert.deepEqual(moved.start_anchor, original.start.anchor);
    assert.deepEqual(moved.points[1], { x: 0.5, y: 0.55 });
    near(moved.points[0].x - original.route.points[0].x, 100 * (1 - original.weights[0]) / size.width);
});

test('moving an interior checkpoint does not change endpoint sides or unrelated checkpoints', () => {
    const original = fixture(3);
    const moved = moveWaypoint(original, 1, { x: 1500, y: 350 });
    assert.deepEqual(moved.start_anchor, original.start.anchor);
    assert.deepEqual(moved.end_anchor, original.end.anchor);
    assert.deepEqual(moved.points[0], original.route.points[0]);
    assert.deepEqual(moved.points[2], original.route.points[2]);
});

test('a single checkpoint can retarget both attachments while remaining under the pointer', () => {
    const original = fixture(1);
    const moved = moveWaypoint(original, 0, { x: 1700, y: 350 });
    assert.equal(moved.start_anchor.side, 'right');
    assert.equal(moved.end_anchor.side, 'right');
    near(moved.points[0].x, 1700 / size.width);
    near(moved.points[0].y, 0.35);
});

test('waypoint dragging within the existing quadrant retains a manually chosen attachment position', () => {
    const base = fixture();
    const original = createRouteMotion(base.route, base.startCard, base.endCard, { side: 'bottom', position: 0.2 }, base.end.anchor, size);
    const moved = moveWaypoint(original, 0, { x: 1100, y: 350 });
    assert.deepEqual(moved.start_anchor, { side: 'bottom', position: 0.2 });
    assert.deepEqual(moved.points[1], original.route.points[1]);
});

test('checkpoint gestures use the initial snapshot rather than accumulating adjustment drift', () => {
    const original = fixture(12);
    const before = structuredClone(original);
    for (let index = 0; index < 100; index++) moveWaypoint(original, 0, { x: 1300 + index, y: 150 });
    assert.deepEqual(original, before);
    assert.deepEqual(moveWaypoint(original, 0, { x: 1500, y: 150 }), moveWaypoint(before, 0, { x: 1500, y: 150 }));
});

test('normal card motion on a mixed-side direct line can exhaust the opposite side and switch it', () => {
    const original = createRouteMotion({ points: [] }, card(1000, 100), card(1400, 500),
        { side: 'right', position: 0.5 }, { side: 'top', position: 0.5 }, size);
    const moved = moveCardConnection(original, 'start', card(0, 100));
    assert.equal(moved.start.anchor.side, 'right');
    assert.equal(moved.end.anchor.side, 'left');
});

test('moving a card respects a custom detour toward its nearest checkpoint rather than the opposite card', () => {
    const original = fixture();
    const rerouted = moveWaypoint(original, 0, { x: 1500, y: 150 });
    const nextGesture = createRouteMotion(rerouted, original.startCard, original.endCard, rerouted.start_anchor, rerouted.end_anchor, size);
    const moved = moveCardConnection(nextGesture, 'start', card(980, 100));
    assert.equal(moved.start.anchor.side, 'right');
    assert.equal(moved.start.point.y, 150);
    assert.equal(moved.start.point.x, 1180);
});

test('without checkpoints either handle can move to all four sides while the opposite handle stays fixed', () => {
    for (const end of ['start', 'end']) {
        const original = fixture(0);
        const node = end === 'start' ? original.startCard : original.endCard;
        const targets = [
            ['top', { x: node.centerX, y: node.top - 100 }],
            ['right', { x: node.right + 100, y: node.centerY }],
            ['bottom', { x: node.centerX, y: node.bottom + 100 }],
            ['left', { x: node.left - 100, y: node.centerY }],
        ];
        for (const [side, pointer] of targets) {
            const moved = moveEndpoint(original, end, pointer);
            const anchorKey = end === 'start' ? 'start_anchor' : 'end_anchor';
            const oppositeKey = end === 'start' ? 'end_anchor' : 'start_anchor';
            assert.deepEqual(moved[anchorKey], { side, position: 0.5 });
            assert.deepEqual(moved[oppositeKey], original[end === 'start' ? 'end' : 'start'].anchor);
            assert.deepEqual(moved.points, []);
        }
    }
});

test('zero-checkpoint handle quadrant changes use rectangle diagonals and stay on the perimeter', () => {
    const original = fixture(0);
    const corner = moveEndpoint(original, 'start', { x: 1400, y: 300 });
    assert.deepEqual(corner.start_anchor, { side: 'bottom', position: 1 });
    const crossed = moveEndpoint(original, 'start', { x: 1400, y: 299 });
    assert.deepEqual(crossed.start_anchor, { side: 'right', position: 1 });
    assert.deepEqual(anchorPoint(original.startCard, crossed.start_anchor), { x: 1200, y: 200 });
});

test('zero-checkpoint manual side selection survives save/reload without creating automatic checkpoints', () => {
    const original = fixture(0);
    const moved = moveEndpoint(original, 'start', { x: 1350, y: 130 });
    const saved = JSON.parse(JSON.stringify(moved));
    assert.deepEqual(saved.start_anchor, { side: 'right', position: 0.3 });
    const restored = createRouteMotion(saved, original.startCard, original.endCard, saved.start_anchor, saved.end_anchor, size);
    assert.deepEqual(restored.start.point, { x: 1200, y: 130 });
    assert.deepEqual(routeFromMotion(restored).points, []);
    assert.deepEqual(restored.end.anchor, original.end.anchor);
});
