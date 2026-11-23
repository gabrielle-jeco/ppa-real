import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridChart, hybridLayout, groupKey, spaceContains, spaceSize, retiredSpaceMembers, fitSpaceMembers } from '../src/general/organizationChartHybrid.ts';
const person = (username, tier) => ({username, name:username, tier, tier_label:tier});
const fixture = count => ({nodes:[person('s','supervisor'), ...Array.from({length:count},(_,i)=>person(`c${i}`,'service_crew'))], edges:Array.from({length:count},(_,i)=>({id:i+1,leader_id:'s',subordinate_id:`c${i}`,status:'active',relation_type:'permanent',is_currently_effective:true}))});
for (const count of [0,1,8,9,20,137,1000]) test(`hybrid representation adapts to ${count} members`,()=>{
    const f=fixture(count), r=hybridChart(f.nodes,f.edges);
    assert.equal(r.nodes.length,count>8?count+2:count+1);
    assert.equal(r.edges.length,count>8?1:count);
    if(count>8) assert.equal(r.nodes.find(n=>n.username===groupKey('s')).group_members.length,count);
});
test('deactivation keeps nine related members grouped, deletion returns eight to stars',()=>{
    const f=fixture(9); f.edges[0].status='inactive';
    assert.equal(hybridChart(f.nodes,f.edges).nodes.length,11);
    const removed=hybridChart(f.nodes.filter(n=>n.username!=='c0'),f.edges.slice(1));
    assert.equal(removed.nodes.length,9); assert.equal(removed.edges.length,8);
});
test('disconnecting every member preserves the group without an active connector',()=>{
    const f=fixture(9);f.edges.forEach(e=>e.status='inactive');
    const r=hybridChart(f.nodes,f.edges);assert.equal(r.nodes.length,11);assert.equal(r.edges[0].status,'inactive');
});
test('shared crew keeps a separate card for its small second team',()=>{
    const f=fixture(9);f.nodes.push(person('other','supervisor'));f.edges.push({...f.edges[0],id:99,leader_id:'other'});
    const r=hybridChart(f.nodes,f.edges);assert.ok(r.nodes.some(n=>n.username==='c0'));assert.ok(r.edges.some(e=>e.id===99));
});

test('a large group stays compact and aligns its supervisor, with or without a CO',()=>{
 for(const hasCo of [false,true]){
  const f=fixture(20);f.nodes.forEach(n=>n.leader_ids=n.tier==='service_crew'?['s']:[]);
  f.nodes.push({...person('manager','store_manager'),leader_ids:[]});
  if(hasCo)f.nodes.push({...person('co','chief_operation'),leader_ids:['manager']});
  const graph=hybridChart(f.nodes,f.edges),layout=hybridLayout(graph.nodes),g=layout.positions[groupKey('s')],spv=layout.positions.s;
  assert.equal(spv.left+115,g.left+spaceSize(20).width/2);assert.equal(g.top-spv.top,188);
  const size=spaceSize(20);assert.ok(g.left+size.width<=layout.width);assert.ok(g.top+size.height<=layout.height);
 }
});

for(const count of [9,20,137,1000]) test(`subspace keeps every original card and fits ${count} active members`,()=>{
 const f=fixture(count);f.nodes.forEach(n=>n.leader_ids=n.tier==='service_crew'?['s']:[]);
 const graph=hybridChart(f.nodes,f.edges), layout=hybridLayout(graph.nodes),size=spaceSize(count),origin=layout.positions[groupKey('s')];
 for(const original of f.nodes){const actual=graph.nodes.find(n=>n.username===original.username);assert.equal(actual.name,original.name);assert.equal(actual.tier,original.tier);}
 for(const node of graph.nodes.filter(n=>n.space_id))assert.ok(spaceContains({...origin,...size},layout.positions[node.username]));
 const cards=graph.nodes.filter(n=>n.space_id).map(n=>layout.positions[n.username]);
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)assert.ok(Math.abs(cards[i].left-cards[j].left)>=230 || Math.abs(cards[i].top-cards[j].top)>=132);
});
test('inactive cards are outside the area and remain in the same shared canvas',()=>{
 const f=fixture(9);f.nodes.forEach(n=>n.leader_ids=['s']);f.edges[0].status='inactive';
 const graph=hybridChart(f.nodes,f.edges),layout=hybridLayout(graph.nodes),origin=layout.positions[groupKey('s')];
 assert.equal(graph.nodes.filter(n=>n.username==='c0').length,1);
 assert.equal(spaceContains({...origin,...spaceSize(9)},layout.positions.c0),false);
 assert.equal(spaceContains({...origin,...spaceSize(9)},layout.positions.c1),true);
});
test('area membership follows card centre and excludes the draggable header',()=>{
 const area={left:100,top:100,width:800,height:600};
 assert.equal(spaceContains(area,{left:130,top:170}),true);
 assert.equal(spaceContains(area,{left:-100,top:170}),false);
 assert.equal(spaceContains(area,{left:130,top:60}),false);
});

test('group-to-star transition targets only the team reduced to eight, including inactive members',()=>{
 const f=fixture(8); f.edges[0].status='inactive';
 const retired=retiredSpaceMembers(f.nodes,f.edges,{[groupKey('s')]:{x:.3,y:.5},[groupKey('other')]:{x:.7,y:.5}});
 assert.equal(retired.size,9);assert.ok(retired.has('s'));assert.ok(retired.has('c0'));assert.equal(retired.has('other'),false);
 const nine=fixture(9);assert.equal(retiredSpaceMembers(nine.nodes,nine.edges,{[groupKey('s')]:{}}).size,0);
 assert.equal(retiredSpaceMembers(f.nodes,f.edges,{c0:{x:.2,y:.3}}).size,0);
});

const overlaps = (a,b) => Math.abs(a.left-b.left)<230 && Math.abs(a.top-b.top)<132;
function assertSeparate(positions) {
 const cards=Object.values(positions);
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)assert.equal(overlaps(cards[i],cards[j]),false);
}
test('shrinking from twenty to nine never places an automatic card on an occupied slot',()=>{
 const origin={left:200,top:400};
 const original=Array.from({length:20},(_,i)=>({username:`c${i}`,space_active:true,space_index:i}));
 const saved=fitSpaceMembers(origin,spaceSize(20),original,{},false);
 for(let count=19;count>=9;count--){
  const members=original.slice(0,count),size=spaceSize(count);
  const result=fitSpaceMembers(origin,size,members,saved,true);
  assert.equal(Object.keys(result).length,count);assertSeparate(result);
  Object.values(result).forEach(p=>assert.equal(spaceContains({...origin,...size},p),true));
 }
});
test('deleting cards from the middle also preserves nine distinct visible cards',()=>{
 const origin={left:30,top:200};
 const original=Array.from({length:20},(_,i)=>({username:`c${i}`,space_active:true,space_index:i}));
 const saved=fitSpaceMembers(origin,spaceSize(20),original,{},false);
 const members=original.filter((_,i)=>[0,2,3,7,8,11,14,18,19].includes(i)).map((m,i)=>({...m,space_index:i}));
 const result=fitSpaceMembers(origin,spaceSize(9),members,saved,true);
 assertSeparate(result);assert.equal(Object.keys(result).length,9);
});
test('existing free placements stay untouched when the area still fits them',()=>{
 const origin={left:0,top:0},members=[{username:'a',space_active:true},{username:'b',space_active:false}];
 const saved={a:{left:79,top:111},b:{left:1200,top:333}};
 assert.deepEqual(fitSpaceMembers(origin,spaceSize(9),members,saved,true),saved);
});
test('unmoved cards reserve their positions before any displaced card is relocated',()=>{
 const origin={left:0,top:0},size=spaceSize(9);
 const members=[{username:'displaced',space_active:true,space_index:3},{username:'preserved',space_active:true,space_index:4}];
 const saved={displaced:{left:800,top:220},preserved:{left:24,top:220}};
 const result=fitSpaceMembers(origin,size,members,saved,true);
 assert.deepEqual(result.preserved,saved.preserved);assertSeparate(result);
});
test('if arbitrary placements block every slot, only active cards in that area are repacked',()=>{
 const origin={left:0,top:0},size=spaceSize(9);
 const members=Array.from({length:9},(_,i)=>({username:`c${i}`,space_active:true,space_index:i}));
 const saved=Object.fromEntries(members.slice(0,8).map((m,i)=>[m.username,{left:90+(i%2)*254,top:140+Math.floor(i/2)*100}]));
 saved.c8={left:900,top:200};
 const result=fitSpaceMembers(origin,size,members,saved,true);
 assert.equal(Object.keys(result).length,9);assertSeparate(result);
});
