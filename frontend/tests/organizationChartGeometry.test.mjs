import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorPoint, createRouteMotion, defaultAnchor, moveCardConnection, moveEndpoint, moveWaypoint, nearestAnchor, routeFromMotion, sideToward } from '../src/general/organizationChartGeometry.ts';

const card = (left, top, width = 200, height = 100) => ({ left, right: left + width, top, bottom: top + height, centerX: left + width / 2, centerY: top + height / 2 });
const size = { width: 3000, height: 1000 };
const near = (actual, expected, tolerance = 0.00001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const fixture = (count = 2) => {
    const points = Array.from({ length: count }, (_, index) => ({ x: 1100 / size.width, y: (200 + 300 * (index + 1) / (count + 1)) / size.height }));
    return createRouteMotion({ points }, card(1000, 100), card(1000, 500), { side: 'bottom', position: 0.5 }, { side: 'top', position: 0.5 }, size);
};

test('tangential movement pins attachments until the card boundary catches them', () => {
    for (const dx of [-80, -20, 0, 20, 80]) {
        const original = fixture();
        const moved = moveCardConnection(original, 'start', card(1000 + dx, 100));
        assert.deepEqual(moved.start.point, original.start.point);
        assert.deepEqual(moved.end, original.end);
        assert.deepEqual(routeFromMotion(moved).points, original.route.points);
    }
    const caught = moveCardConnection(fixture(), 'start', card(870, 100));
    assert.equal(caught.start.point.x, 1070);
    assert.equal(caught.end.point.x, 1100);
});

test('normal card movement changes only its first segment for any number of checkpoints', () => {
    for (const count of [1, 2, 3, 1000]) {
        const original = fixture(count);
        const moved = moveCardConnection(original, 'start', card(1000, 120));
        assert.equal(moved.start.point.y, 220);
        assert.deepEqual(moved.end, original.end);
        assert.deepEqual(routeFromMotion(moved).points, original.route.points);
    }
});

test('checkpoint drag changes precisely one point, including the first and last', () => {
    for (const count of [1, 2, 3, 1000]) for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
        const original = fixture(count);
        const route = moveWaypoint(original, index, { x: 1700, y: 750 });
        assert.equal(route.points.length, count);
        route.points.forEach((point, i) => i === index ? assert.deepEqual(point, { x: 0.56667, y: .75 }) : assert.deepEqual(point, original.route.points[i]));
    }
});

test('endpoint drag inserts exactly one point per gesture and never moves existing points', () => {
    for (const end of ['start', 'end']) for (const count of [0, 2, 3, 999]) {
        const original = fixture(count);
        for (const pointer of [{ x: 1400, y: 150 }, { x: 900, y: 150 }, { x: 1100, y: 0 }, { x: 1100, y: 700 }]) {
            const route = moveEndpoint(original, end, pointer);
            assert.equal(route.points.length, count + 1);
            assert.deepEqual(end === 'start' ? route.points.slice(1) : route.points.slice(0, -1), original.route.points);
            assert.deepEqual(route[end === 'start' ? 'end_anchor' : 'start_anchor'], original[end === 'start' ? 'end' : 'start'].anchor);
        }
    }
});

test('manual endpoint follows all four sides even when existing points are present', () => {
    const original = fixture(3);
    for (const [side, pointer] of [['top', {x:1100,y:0}], ['bottom',{x:1100,y:250}], ['left',{x:900,y:150}], ['right',{x:1300,y:150}]]) {
        const result = moveEndpoint(original, 'start', pointer);
        assert.equal(result.start_anchor.side, side);
        near(result.start_anchor.position, .5);
    }
});

test('card orbit adapts its perimeter attachment while all checkpoints and the far endpoint stay fixed', () => {
    const original = fixture(3);
    const above = moveCardConnection(original, 'start', card(1000, 400));
    assert.equal(above.start.anchor.side, 'top');
    assert.deepEqual(routeFromMotion(above).points, original.route.points);
    assert.deepEqual(above.end, original.end);
    assert.deepEqual(anchorPoint(above.startCard, above.start.anchor), above.start.point);
});

test('left and right attachments pin tangentially and follow normal motion', () => {
    const original = createRouteMotion({ points: [{ x: .45, y: .2 }] }, card(1000,100,100,200), card(1600,100,100,200), {side:'right',position:.5}, {side:'left',position:.5}, size);
    const vertical = moveCardConnection(original, 'start', card(1000,40,100,200));
    assert.deepEqual(vertical.start.point, original.start.point);
    const normal = moveCardConnection(original, 'start', card(1020,100,100,200));
    assert.equal(normal.start.point.x, 1120);
    assert.deepEqual(routeFromMotion(normal).points, original.route.points);
});

test('reversing within available side space leaves the caught attachment pinned', () => {
    const moved = moveCardConnection(fixture(), 'start', card(870,100));
    const reversed = moveCardConnection(moved, 'start', card(1000,100));
    assert.deepEqual(reversed.start.point, moved.start.point);
    assert.deepEqual(reversed.end, moved.end);
});

test('direct edges work without checkpoints and serialize relative anchors correctly', () => {
    const original = fixture(0);
    const moved = moveCardConnection(original, 'start', card(700,100));
    const route = JSON.parse(JSON.stringify(routeFromMotion(moved)));
    const loaded = createRouteMotion(route, moved.startCard, moved.endCard, route.start_anchor, route.end_anchor, size);
    assert.deepEqual(loaded.start.point, moved.start.point);
    assert.deepEqual(loaded.end.point, moved.end.point);
    assert.deepEqual(route.points, []);
});

test('default anchors remain rectangular and clamp offsets to the card', () => {
    const node = card(0,0);
    assert.equal(sideToward(node, {x:250,y:120}), 'right');
    assert.equal(sideToward(node, {x:250,y:130}), 'bottom');
    assert.equal(defaultAnchor(node, {x:100,y:200}, 10000).position, 1);
    assert.equal(defaultAnchor(node, {x:100,y:200}, -10000).position, 0);
});

test('first checkpoint slides attachment across the same bottom side instead of keeping its centre', () => {
    const original = fixture(3);
    for (const x of [1020, 1070, 1150, 1190]) {
        const route = moveWaypoint(original, 0, { x, y: 260 });
        const endpoint = anchorPoint(original.startCard, route.start_anchor);
        assert.equal(endpoint.x, x);
        assert.equal(endpoint.y, original.startCard.bottom);
        assert.deepEqual(route.end_anchor, original.end.anchor);
        assert.deepEqual(route.points.slice(1), original.route.points.slice(1));
    }
});

test('last checkpoint slides attachment across the top edge in both directions', () => {
    const original = fixture(3);
    for (const x of [1010, 1080, 1170, 1190]) {
        const route = moveWaypoint(original, 2, { x, y: 420 });
        const endpoint = anchorPoint(original.endCard, route.end_anchor);
        assert.equal(endpoint.x, x);
        assert.equal(endpoint.y, original.endCard.top);
        assert.deepEqual(route.start_anchor, original.start.anchor);
        assert.deepEqual(route.points.slice(0, 2), original.route.points.slice(0, 2));
    }
});

test('checkpoint attachment can follow the full perimeter without moving other points', () => {
    const original = fixture(3);
    for (const [pointer, expected] of [
        [{x:1040,y:50},{x:1040,y:100}], [{x:1250,y:120},{x:1200,y:120}],
        [{x:1160,y:250},{x:1160,y:200}], [{x:950,y:175},{x:1000,y:175}],
    ]) {
        const route = moveWaypoint(original, 0, pointer);
        assert.deepEqual(anchorPoint(original.startCard, route.start_anchor), expected);
        assert.deepEqual(route.points.slice(1), original.route.points.slice(1));
        assert.deepEqual(route.end_anchor, original.end.anchor);
    }
});

test('legacy waypoint-only routes attach near their nearest checkpoint rather than side centre', () => {
    const c = card(1000, 100);
    assert.deepEqual(anchorPoint(c, nearestAnchor(c, {x:1180,y:270})), {x:1180,y:200});
    assert.deepEqual(anchorPoint(c, nearestAnchor(c, {x:900,y:120})), {x:1000,y:120});
});
