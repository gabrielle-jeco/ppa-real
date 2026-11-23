export type GroupPerson = {
    username: string;
    name: string;
    tier: string;
    tier_label: string;
    job_level_name?: string | null;
    division_name?: string | null;
    leader_ids?: string[];
};
export type GroupEdge = {
    leader_id: string;
    subordinate_id: string;
    status: string;
    relation_type: string;
    is_currently_effective: boolean;
    is_mirror_member?: boolean;
};
export type CrewMember = {
    person: GroupPerson;
    backup: boolean;
    inactive: boolean;
    otherLeaders: { username: string; name: string }[];
};
export type SupervisorGroup = {
    supervisor: GroupPerson;
    paths: GroupPerson[][];
    members: CrewMember[];
};
export type OrganizationGroups = {
    groups: SupervisorGroup[];
    unassigned: CrewMember[];
    standaloneLeaders: GroupPerson[];
    crewCount: number;
};

export const organizationRoleLabel = (person: GroupPerson): string => person.tier === 'store_manager' ? 'Manager' : person.tier_label;

export function buildOrganizationGroups(nodes: GroupPerson[], edges: GroupEdge[], parentNodes: GroupPerson[] = []): OrganizationGroups {
    const visible = new Map(nodes.map((person) => [person.username, person]));
    const people = new Map([...parentNodes, ...nodes].map((person) => [person.username, person]));
    const relations = edges.filter((edge) => edge.relation_type === 'permanent' || edge.is_currently_effective || edge.is_mirror_member);
    const active = relations.filter((edge) => edge.status === 'active');
    const crew = nodes.filter((person) => person.tier === 'service_crew');
    const ancestorIds = new Set<string>();
    const assigned = new Set<string>();
    const parentsFor = (id: string, seen: Set<string>): GroupPerson[][] => {
        const parents = [...new Set(active.filter((edge) => edge.subordinate_id === id).map((edge) => edge.leader_id))]
            .filter((parent) => !seen.has(parent) && visible.has(parent) && ['store_manager', 'chief_operation'].includes(visible.get(parent)!.tier));
        return parents.flatMap((id) => {
            const parent = visible.get(id)!;
            ancestorIds.add(id);
            const upstream = parentsFor(id, new Set([...seen, id]));
            return upstream.length ? upstream.map((path) => [...path, parent]) : [[parent]];
        });
    };
    const memberFor = (person: GroupPerson, supervisor?: string): CrewMember => {
        const own = relations.filter((edge) => edge.subordinate_id === person.username && (!supervisor || edge.leader_id === supervisor));
        const leaderIds = new Set([...(person.leader_ids || []), ...active.filter((edge) => edge.subordinate_id === person.username).map((edge) => edge.leader_id)]);
        return {
            person,
            backup: own.some((edge) => edge.relation_type === 'backup'),
            inactive: own.length > 0 && !own.some((edge) => edge.status === 'active'),
            otherLeaders: [...leaderIds].filter((id) => id !== supervisor).map((id) => ({ username: id, name: people.get(id)?.name || id })),
        };
    };
    const groups = nodes.filter((person) => person.tier === 'supervisor').map((supervisor) => {
        const memberIds = new Set(relations.filter((edge) => edge.leader_id === supervisor.username).map((edge) => edge.subordinate_id));
        const members = crew.filter((person) => memberIds.has(person.username)).map((person) => {
            assigned.add(person.username);
            return memberFor(person, supervisor.username);
        });
        return { supervisor, paths: parentsFor(supervisor.username, new Set([supervisor.username])), members };
    });
    return {
        groups,
        unassigned: crew.filter((person) => !assigned.has(person.username)).map((person) => memberFor(person)),
        standaloneLeaders: nodes.filter((person) => ['store_manager', 'chief_operation'].includes(person.tier) && !ancestorIds.has(person.username)),
        crewCount: crew.length,
    };
}

export function filterCrew(members: CrewMember[], search: string): CrewMember[] {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return query ? members.filter(({ person }) => `${person.username} ${person.name} ${person.job_level_name || ''} ${person.division_name || ''}`.toLocaleLowerCase('id-ID').includes(query)) : members;
}

export function memberRelationLabel(member: CrewMember): string {
    return [member.backup ? (member.inactive ? 'Backup nonaktif' : 'Backup aktif') : '', member.inactive ? 'Relasi nonaktif' : '', ...member.otherLeaders.map((person) => `Atasan lain: ${person.name} (${person.username})`)].filter(Boolean).join(' | ');
}
