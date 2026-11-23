import test from 'node:test';
import assert from 'node:assert/strict';
import { starLayout, columnStarRoute, legacyCanvas, convertLegacyNodes, preserveLegacyRoutes, fitNewMembers, compactRoute, segmentCrossesCard, growCanvasLayout, CARD_WIDTH, CARD_HEIGHT } from '../src/general/organizationChartLayout.ts';
import { anchorPoint } from '../src/general/organizationChartGeometry.ts';
import { imagePagesPdf } from '../src/general/organizationChartPdf.ts';

const fixture = (count, co = true) => [
    { username: 'sm', tier: 'store_manager', leader_ids: [] },
    ...(co ? [{ username: 'co', tier: 'chief_operation', leader_ids: ['sm'] }] : []),
    { username: 'spv', tier: 'supervisor', leader_ids: [co ? 'co' : 'sm'] },
    ...Array.from({ length: count }, (_, i) => ({ username: `sc-${i}`, tier: 'service_crew', leader_ids: ['spv'] })),
];

for (const count of [0, 1, 5, 13, 20, 50, 150, 1000]) test(`star layout keeps ${count} crew inside canvas without overlapping cards`, () => {
    const nodes = fixture(count);
    const layout = starLayout(nodes);
    assert.equal(Object.keys(layout.positions).length, nodes.length);
    const positions = Object.values(layout.positions);
    positions.forEach((p, i) => {
        assert.ok(p.left >= 0 && p.top >= 0 && p.left + CARD_WIDTH <= layout.width && p.top + CARD_HEIGHT <= layout.height);
        for (const other of positions.slice(i + 1)) assert.ok(Math.abs(other.left - p.left) >= CARD_WIDTH || Math.abs(other.top - p.top) >= CARD_HEIGHT, `overlap ${i}`);
    });
    assert.ok(layout.positions.sm.top < layout.positions.co.top && layout.positions.co.top < layout.positions.spv.top);
    if (count >= 5) {
        const crew = nodes.filter((n) => n.tier === 'service_crew').map((n) => layout.positions[n.username]);
        assert.ok(crew.some((p) => p.left < layout.positions.spv.left));
        assert.ok(crew.some((p) => p.left > layout.positions.spv.left));
    }
});

test('without CO, manager remains above supervisor; shared crew is placed once across hubs', () => {
    const nodes = fixture(13, false);
    nodes.push({ username: 'spv2', tier: 'supervisor', leader_ids: ['sm'] });
    nodes.at(-2).leader_ids.push('spv2');
    const layout = starLayout(nodes);
    assert.equal(Object.keys(layout.positions).length, nodes.length);
    assert.ok(layout.positions.sm.top < layout.positions.spv.top);
});

test('legacy conversion preserves exact pixel positions and custom routes', () => {
    const nodes = fixture(13);
    const size = legacyCanvas(nodes, 900);
    const saved = { spv: { x: 0.2, y: 0.7 }, 'sc-0': { x: 0.1, y: 0 } };
    const converted = convertLegacyNodes(nodes, saved, size);
    for (const [id, position] of Object.entries(saved)) {
        const tier = nodes.find((n) => n.username === id).tier;
        const tierIndex = ['store_manager', 'chief_operation', 'supervisor', 'service_crew'].indexOf(tier);
        const oldTop = tierIndex * 190 + 12 + position.y * (190 - CARD_HEIGHT - 24);
        const newTop = 12 + converted[id].y * (760 - CARD_HEIGHT - 24);
        assert.ok(Math.abs(oldTop - newTop) < 0.000001);
        assert.equal(converted[id].x, position.x);
    }
    const custom = { '2': { points: [], start_anchor: { side: 'right', position: 0.2 } } };
    const edges = [{ id: 1, leader_id: 'sm', subordinate_id: 'co' }, { id: 2, leader_id: 'co', subordinate_id: 'spv' }];
    const routes = preserveLegacyRoutes(converted, edges, custom, size);
    assert.deepEqual(routes['2'], custom['2']);
    assert.equal(routes['1'].points.length, 2);
    assert.deepEqual(custom, { '2': { points: [], start_anchor: { side: 'right', position: 0.2 } } });
});

test('PDF writer creates independent image pages and correct byte offsets', () => {
    const page = { jpeg: new Uint8Array([255, 216, 255, 217]), width: 595, height: 842, pixelsWide: 1190, pixelsHigh: 1684 };
    const bytes = imagePagesPdf([page, page, page]);
    const pdf = new TextDecoder('latin1').decode(bytes);
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.ok(pdf.includes('/Count 3'));
    assert.equal((pdf.match(/\/Type \/Page /g) || []).length, 3);
    const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.equal(pdf.slice(xref, xref + 4), 'xref');
    const entries = pdf.slice(xref).split('\n').slice(3, 14);
    entries.forEach((entry, i) => { const offset = Number(entry.slice(0, 10)); assert.ok(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)); });
});


test('new members expand canvas without displacing saved cards or checkpoints', () => {
    const nodes = fixture(40);
    const saved = { spv: { x: 0.5, y: 0.8 } };
    const old = { width: 900, height: 760 };
    const edges = { '1': { points: [{ x: 0.25, y: 0.7 }], start_anchor: { side: 'right', position: 0.4 } } };
    const fitted = fitNewMembers(nodes, saved, edges, old);
    assert.ok(fitted.canvas.width > old.width);
    assert.ok(Math.abs(24 + fitted.nodes.spv.x * (fitted.canvas.width - CARD_WIDTH - 48) - (24 + 0.5 * (900 - CARD_WIDTH - 48))) < 0.000001);
    assert.ok(Math.abs(fitted.edges['1'].points[0].y * fitted.canvas.height - 0.7 * old.height) < 0.000001);
    assert.deepEqual(fitted.edges['1'].start_anchor, edges['1'].start_anchor);
    assert.equal(Object.keys(fitted.nodes).length, nodes.length);
});


for (const count of [13, 20, 50]) test(`compact ${count}-crew layout avoids cards and excessive line lengths`, () => {
    const nodes = fixture(count);
    const layout = starLayout(nodes);
    const cards = Object.fromEntries(nodes.map((n) => {
        const p = layout.positions[n.username];
        return [n.username, { ...p, right: p.left + CARD_WIDTH, bottom: p.top + CARD_HEIGHT, centerX: p.left + CARD_WIDTH / 2, centerY: p.top + CARD_HEIGHT / 2 }];
    }));
    if (count <= 20) { assert.ok(layout.width <= 1400, `width ${layout.width}`); assert.ok(layout.height <= 900, `height ${layout.height}`); }
    for (const node of nodes) for (const parent of node.leader_ids) {
        const leader = cards[parent], subordinate = cards[node.username];
        const route = compactRoute(leader, subordinate, Object.values(cards), layout);
        const points = [anchorPoint(leader, route.start_anchor), ...route.points.map((p) => ({ x: p.x * layout.width, y: p.y * layout.height })), anchorPoint(subordinate, route.end_anchor)];
        points.forEach((p) => assert.ok(p.x >= 0 && p.y >= 0 && p.x <= layout.width && p.y <= layout.height));
        for (let i = 1; i < points.length; i++) for (const card of Object.values(cards)) assert.ok(!segmentCrossesCard(points[i - 1], points[i], card), `line ${parent} -> ${node.username} crosses card`);
        const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
        if (count <= 20) assert.ok(length < 1200, `line length ${length}`);
    }
});


for (const [side, moving] of [
    ['left', { left: -300, top: 200 }], ['top', { left: 300, top: -300 }],
    ['right', { left: 1400, top: 200 }], ['bottom', { left: 300, top: 1200 }],
]) test(`canvas grows toward ${side} while preserving other cards and every checkpoint`, () => {
    const source = { width: 1310, height: 820 };
    const fixed = { left: 500, top: 300 };
    const routes = { '1': { points: [{ x: 0.2, y: 0.4 }, { x: 0.7, y: 0.9 }], start_anchor: { side: 'right', position: 0.3 }, end_anchor: { side: 'top', position: 0.8 } }, '2': { points: [] } };
    const previous = { left: 0, top: 0, right: source.width, bottom: source.height };
    const result = growCanvasLayout({ moving, fixed }, routes, source, previous, source);
    assert.ok(side === 'left' || side === 'right' ? result.canvas.width > source.width : result.canvas.height > source.height);
    for (const [id, position] of Object.entries({ moving, fixed })) {
        const p = result.nodes[id];
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
        assert.ok(Math.abs(24 + p.x * (result.canvas.width - CARD_WIDTH - 48) - result.shift.x - position.left) < 0.000001);
        assert.ok(Math.abs(12 + p.y * (result.canvas.height - CARD_HEIGHT - 24) - result.shift.y - position.top) < 0.000001);
    }
    result.routes['1'].points.forEach((p, i) => {
        assert.ok(Math.abs(p.x * result.canvas.width - result.shift.x - routes['1'].points[i].x * source.width) < 0.000001);
        assert.ok(Math.abs(p.y * result.canvas.height - result.shift.y - routes['1'].points[i].y * source.height) < 0.000001);
    });
    assert.deepEqual(result.routes['1'].start_anchor, routes['1'].start_anchor);
    assert.deepEqual(result.routes['2'], routes['2']);
    assert.deepEqual(growCanvasLayout({ moving, fixed }, routes, source, result.extent, source), result);
});

test('expansion includes negative and overflowing checkpoint positions without clipping', () => {
    const source = { width: 1310, height: 820 };
    const routes = { '1': { points: [{ x: -0.3, y: -0.2 }, { x: 1.8, y: 1.9 }] } };
    const result = growCanvasLayout({ card: { left: 500, top: 300 } }, routes, source, { left: 0, top: 0, right: 1310, bottom: 820 }, { width: 1800, height: 1080 });
    assert.ok(result.canvas.width >= 1800 + result.shift.x);
    assert.ok(result.canvas.height >= 1080 + result.shift.y);
    assert.ok(result.routes['1'].points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    assert.ok(Math.abs(result.routes['1'].points[0].x * result.canvas.width - result.shift.x - source.width * -0.3) < 0.000001);
});

for (let count = 1; count <= 8; count++) test(`small star ${count} SC balances left and right columns starting on left`, () => {
    const nodes = fixture(count), layout = starLayout(nodes), hub = layout.positions.spv;
    const crew = nodes.filter(node => node.tier === 'service_crew').map(node => layout.positions[node.username]);
    const left = crew.filter(p => p.left < hub.left), right = crew.filter(p => p.left > hub.left);
    assert.equal(left.length, Math.ceil(count / 2)); assert.equal(right.length, Math.floor(count / 2));
    for (const column of [left, right]) if (column.length) {
        assert.equal(new Set(column.map(p => p.left)).size, 1);
        assert.equal(column.reduce((sum,p) => sum + p.top, 0) / column.length, hub.top);
    }
    crew.forEach((p,i) => assert.equal(p.left < hub.left, i % 2 === 0));
});

test('balanced eight-card star has separate straight spokes which avoid every other card',()=>{
 const nodes=fixture(8),layout=starLayout(nodes);
 const cards=Object.fromEntries(nodes.map(node=>{const p=layout.positions[node.username];return [node.username,{...p,right:p.left+CARD_WIDTH,bottom:p.top+CARD_HEIGHT,centerX:p.left+CARD_WIDTH/2,centerY:p.top+CARD_HEIGHT/2}];}));
 const hub=cards.spv;
 for(const left of [true,false]){
  const side=nodes.filter(n=>n.tier==='service_crew'&&(cards[n.username].centerX<hub.centerX)===left).sort((a,b)=>cards[a.username].top-cards[b.username].top);
  const anchors=[];
  side.forEach((node,index)=>{
   const route=columnStarRoute(hub,cards[node.username],index,side.length);assert.deepEqual(route.points,[]);anchors.push(route.start_anchor.position);
   const start={x:left?hub.left:hub.right,y:hub.top+CARD_HEIGHT*route.start_anchor.position};
   const target=cards[node.username],end={x:left?target.right:target.left,y:target.centerY};
   for(const [id,card]of Object.entries(cards))if(id!=='spv'&&id!==node.username)assert.equal(segmentCrossesCard(start,end,card),false);
  });
  assert.equal(new Set(anchors).size,4);
 }
});
