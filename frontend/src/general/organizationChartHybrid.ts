import { starLayout, CARD_HEIGHT, CARD_WIDTH, CANVAS_PADDING } from './organizationChartLayout.ts';
import { buildOrganizationGroups } from './organizationChartGroups.ts';
import type { GroupPerson, GroupEdge } from './organizationChartGroups.ts';

export const GROUP_THRESHOLD = 8;
export const groupKey = (supervisor: string) => `__space__:${supervisor}`;
type Person = GroupPerson & {
    group_supervisor?: string; group_members?: string[]; space_size?: { width: number; height: number };
    space_id?: string; space_active?: boolean; space_index?: number;
};
type Edge = GroupEdge & { id: number; group_supervisor?: string };

export function hybridChart<N extends Person, E extends Edge>(nodes: N[], edges: E[]) {
    const groups = buildOrganizationGroups(nodes, edges).groups.filter(group => group.members.length > GROUP_THRESHOLD);
    const placements = new Map<string, { space_id: string; space_active: boolean; space_index: number }>();
    const replacements: N[] = [];
    const replacedEdges = new Set<number>();
    const connectors: E[] = [];
    for (const group of groups) {
        const ids = group.members.map(member => member.person.username);
        for (const active of [true, false]) {
            group.members.filter(member => member.inactive !== active).forEach((member, index) => {
                const previous = placements.get(member.person.username);
                if (!previous || (active && !previous.space_active)) placements.set(member.person.username, { space_id: groupKey(group.supervisor.username), space_active: active, space_index: index });
            });
        }
        const own = edges.filter(edge => edge.leader_id === group.supervisor.username && ids.includes(edge.subordinate_id));
        own.forEach(edge => replacedEdges.add(edge.id));
        const template = nodes.find(node => node.username === ids[0])!;
        replacements.push({ ...template, username: groupKey(group.supervisor.username), name: 'Service Crew', group_supervisor: group.supervisor.username, group_members: ids, space_size: spaceSize(ids.length) });
        const first = [...own].sort((a, b) => a.id - b.id)[0];
        const active = own.filter(edge => edge.status === 'active' && edge.is_currently_effective);
        connectors.push({ ...first, id: -first.id, subordinate_id: groupKey(group.supervisor.username), group_supervisor: group.supervisor.username,
            status: active.length ? 'active' : 'inactive', relation_type: active.some(edge => edge.relation_type === 'permanent') ? 'permanent' : first.relation_type,
            is_currently_effective: active.length > 0 });
    }
    return { nodes: [...nodes.map(node => ({ ...node, ...placements.get(node.username) })), ...replacements],
        edges: [...edges.filter(edge => !replacedEdges.has(edge.id)), ...connectors] };
}

export function spaceSize(count: number) {
    const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, count) * .75)));
    return { width: columns * (CARD_WIDTH + 24) + 24, height: Math.ceil(Math.max(1, count) / columns) * (CARD_HEIGHT + 24) + 80 };
}

export function spaceContains(space: { left: number; top: number; width: number; height: number }, card: { left: number; top: number }) {
    const x = card.left + CARD_WIDTH / 2, y = card.top + CARD_HEIGHT / 2;
    return x >= space.left + 12 && x <= space.left + space.width - 12 && y >= space.top + 52 && y <= space.top + space.height - 12;
}

type SpacePosition = { left: number; top: number };
type SpaceMember = { username: string; space_active?: boolean; space_index?: number };

export function fitSpaceMembers(origin: SpacePosition, size: { width: number; height: number }, members: SpaceMember[], saved: Record<string, SpacePosition>, keepSaved: boolean): Record<string, SpacePosition> {
    const result: Record<string, SpacePosition> = {};
    const columns = Math.round((size.width - 24) / (CARD_WIDTH + 24));
    const rows = Math.round((size.height - 80) / (CARD_HEIGHT + 24));
    const activeSlot = (index: number) => ({ left: origin.left + 24 + (index % columns) * (CARD_WIDTH + 24), top: origin.top + 64 + Math.floor(index / columns) * (CARD_HEIGHT + 24) });
    const inactiveSlot = (index: number) => ({ left: origin.left + size.width + 40 + (index % 2) * (CARD_WIDTH + 24), top: origin.top + 64 + Math.floor(index / 2) * (CARD_HEIGHT + 24) });
    const overlaps = (candidate: SpacePosition) => Object.values(result).some(other => Math.abs(other.left - candidate.left) < CARD_WIDTH && Math.abs(other.top - candidate.top) < CARD_HEIGHT);
    const pending = members.filter(member => {
        const current = saved[member.username];
        if (keepSaved && current && spaceContains({ ...origin, ...size }, current) === member.space_active) {
            result[member.username] = current;
            return false;
        }
        return true;
    });
    for (const member of pending.filter(item => item.space_active)) {
        const preferred = activeSlot(member.space_index || 0);
        let candidate = overlaps(preferred) ? undefined : preferred;
        for (let index = 0; !candidate && index < columns * rows; index++) {
            const slot = activeSlot(index);
            if (!overlaps(slot)) candidate = slot;
        }
        if (!candidate) {
            // Free placements can span several slots; repack this area's active cards only when no free slot remains.
            members.filter(item => item.space_active).forEach((item, index) => { result[item.username] = activeSlot(index); });
            break;
        }
        result[member.username] = candidate;
    }
    for (const member of pending.filter(item => !item.space_active)) {
        let index = member.space_index || 0;
        while (overlaps(inactiveSlot(index))) index++;
        result[member.username] = inactiveSlot(index);
    }
    return result;
}

export function hybridLayout(nodes: (Person & { leader_ids: string[] })[]) {
    const layout = starLayout(nodes.filter(node => !node.group_supervisor && !node.space_id));
    const groups = nodes.filter(node => node.group_supervisor);
    if (!groups.length) return layout;
    const hasIndividualCrew = nodes.some(node => node.tier === 'service_crew' && !node.group_supervisor && !node.space_id);
    const supervisorTop = nodes.some(node => node.tier === 'chief_operation') ? 344 : 210;
    const top = hasIndividualCrew ? Math.max(...Object.values(layout.positions).map(p => p.top + CARD_HEIGHT)) + 56 : supervisorTop + CARD_HEIGHT + 56;
    let cursor = CANVAS_PADDING;
    groups.forEach(node => {
        const size = node.space_size!;
        const left = cursor;
        layout.positions[node.username] = { left, top };
        if (!hasIndividualCrew) layout.positions[node.group_supervisor!] = { left: left + (size.width - CARD_WIDTH) / 2, top: supervisorTop };
        const columns = Math.round((size.width - 24) / (CARD_WIDTH + 24));
        const members = nodes.filter(member => member.space_id === node.username);
        members.forEach(member => {
            const index = member.space_index || 0;
            layout.positions[member.username] = member.space_active
                ? { left: left + 24 + (index % columns) * (CARD_WIDTH + 24), top: top + 64 + Math.floor(index / columns) * (CARD_HEIGHT + 24) }
                : { left: left + size.width + 40 + (index % 2) * (CARD_WIDTH + 24), top: top + 64 + Math.floor(index / 2) * (CARD_HEIGHT + 24) };
        });
        const inactive = members.filter(member => !member.space_active).length;
        cursor += size.width + (inactive ? 2 * (CARD_WIDTH + 24) + 40 : 0) + 64;
        layout.height = Math.max(layout.height, top + size.height + 24, top + 64 + Math.ceil(inactive / 2) * (CARD_HEIGHT + 24));
    });
    layout.width = Math.max(layout.width, cursor);
    return layout;
}

export function retiredSpaceMembers(nodes: GroupPerson[], edges: GroupEdge[], saved: Record<string, unknown>): Set<string> {
    const groups = buildOrganizationGroups(nodes, edges).groups;
    const stillGrouped = new Set(groups.filter(group => group.members.length > GROUP_THRESHOLD).flatMap(group => group.members.map(member => member.person.username)));
    return new Set(groups.filter(group => group.members.length <= GROUP_THRESHOLD &&
        (Object.hasOwn(saved, groupKey(group.supervisor.username)) || Object.hasOwn(saved, `__group__:${group.supervisor.username}`)))
        .flatMap(group => [group.supervisor.username, ...group.members.filter(member => !stillGrouped.has(member.person.username)).map(member => member.person.username)]));
}
