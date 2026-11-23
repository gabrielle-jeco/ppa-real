import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrganizationGroups, filterCrew, memberRelationLabel } from '../src/general/organizationChartGroups.ts';

const person = (username, tier, leader_ids = []) => ({ username, name: username, tier, tier_label: tier, leader_ids });
const edge = (leader_id, subordinate_id, fields = {}) => ({ leader_id, subordinate_id, status: 'active', relation_type: 'permanent', is_currently_effective: true, ...fields });

for (const count of [0, 1, 13, 20, 137, 1000]) test(`group includes every one of ${count} crew without a display cap`, () => {
    const nodes = [person('manager', 'store_manager'), person('co', 'chief_operation'), person('spv', 'supervisor'), ...Array.from({ length: count }, (_, i) => person(`crew-${i}`, 'service_crew', ['spv']))];
    const edges = [edge('manager', 'co'), edge('co', 'spv'), ...nodes.filter((n) => n.tier === 'service_crew').map((n) => edge('spv', n.username))];
    const result = buildOrganizationGroups(nodes, edges);
    assert.equal(result.crewCount, count);
    assert.equal(result.groups[0].members.length, count);
    assert.deepEqual(result.groups[0].paths.map((path) => path.map((n) => n.username)), [['manager', 'co']]);
    assert.equal(result.unassigned.length, 0);
    assert.equal(result.standaloneLeaders.length, 0);
});

test('direct manager chain and multiple ancestor paths follow real edges', () => {
    const nodes = [person('m1', 'store_manager'), person('m2', 'store_manager'), person('co', 'chief_operation'), person('spv', 'supervisor')];
    const result = buildOrganizationGroups(nodes, [edge('m1', 'spv'), edge('m2', 'co'), edge('co', 'spv')]);
    assert.deepEqual(result.groups[0].paths.map((path) => path.map((n) => n.username)), [['m1'], ['m2', 'co']]);
});

test('shared crew appears once in each actual supervisor group with other leader details', () => {
    const nodes = [person('s1', 'supervisor'), person('s2', 'supervisor'), person('crew', 'service_crew', ['s1', 's2'])];
    const result = buildOrganizationGroups(nodes, [edge('s1', 'crew'), edge('s2', 'crew'), edge('s1', 'crew')]);
    assert.equal(result.crewCount, 1);
    assert.deepEqual(result.groups.map((g) => g.members.length), [1, 1]);
    assert.deepEqual(result.groups[0].members[0].otherLeaders, [{ username: 's2', name: 's2' }]);
    assert.match(memberRelationLabel(result.groups[1].members[0]), /Atasan lain: s1/);
});

test('effective backups and inactive permanent relations are labeled; expired backups stay out', () => {
    const nodes = [person('spv', 'supervisor'), person('backup', 'service_crew'), person('inactive', 'service_crew'), person('expired', 'service_crew')];
    const result = buildOrganizationGroups(nodes, [edge('spv', 'backup', { relation_type: 'backup' }), edge('spv', 'inactive', { status: 'inactive' }), edge('spv', 'expired', { relation_type: 'backup', is_currently_effective: false })]);
    assert.deepEqual(result.groups[0].members.map((m) => m.person.username), ['backup', 'inactive']);
    assert.equal(result.groups[0].members[0].backup, true);
    assert.equal(result.groups[0].members[1].inactive, true);
    assert.equal(result.unassigned[0].person.username, 'expired');
});

test('hidden supervisor metadata supplies additional leader names without creating a visible group', () => {
    const nodes = [person('spv', 'supervisor'), person('crew', 'service_crew', ['spv', 'hidden'])];
    const result = buildOrganizationGroups(nodes, [edge('spv', 'crew')], [{ ...person('hidden', 'supervisor'), name: 'Supervisor Lain' }]);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].members[0].otherLeaders[0].name, 'Supervisor Lain');
});

test('search handles whitespace, case, identifier, job and division without mutating membership', () => {
    const nodes = [person('spv', 'supervisor'), { ...person('700001', 'service_crew'), name: 'Budi Crew', job_level_name: 'Kasir', division_name: 'Supermarket' }];
    const members = buildOrganizationGroups(nodes, [edge('spv', '700001')]).groups[0].members;
    for (const query of [' BUDI ', '700001', 'kasir', 'SUPERMARKET']) assert.equal(filterCrew(members, query).length, 1);
    assert.equal(filterCrew(members, 'missing').length, 0);
    assert.equal(filterCrew(members, '').length, 1);
    assert.equal(members.length, 1);
});

test('cycles do not recurse forever and leaders without a visible supervisor remain represented', () => {
    const nodes = [person('m1', 'store_manager'), person('m2', 'store_manager'), person('spv', 'supervisor'), person('alone', 'chief_operation')];
    const result = buildOrganizationGroups(nodes, [edge('m1', 'm2'), edge('m2', 'm1'), edge('m1', 'spv')]);
    assert.equal(result.groups[0].paths[0].length, 2);
    assert.deepEqual(result.standaloneLeaders.map((p) => p.username), ['alone']);
});
