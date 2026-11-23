import React, { useLayoutEffect, useRef, useState } from 'react';
import { anchorPoint, createRouteMotion, defaultAnchor, moveCardConnection, moveEndpoint, moveWaypoint, routeFromMotion } from './organizationChartGeometry';
import type { EdgeEnd, EdgeRoute, RouteMotion } from './organizationChartGeometry';
import {
    AlertTriangle,
    Check,
    ChevronDown,
    GitBranch,
    GripVertical,
    Link2,
    Pencil,
    Plus,
    RefreshCcw,
    RotateCcw,
    Search,
    Trash2,
    Unlink,
    X,
} from 'lucide-react';

type Tier = 'store_manager' | 'chief_operation' | 'supervisor' | 'service_crew';

type LocationOption = { initial: string; name: string };
type JobLevelOption = { id: number; name: string; position_code?: string | null; tier: Tier | null };
type ChartNode = {
    username: string;
    name: string;
    job_level_id?: number | null;
    job_level_name?: string | null;
    position_code?: string | null;
    division_name?: string | null;
    tier: Tier;
    tier_label: string;
    leader_ids: string[];
    inactive_leader_ids: string[];
    can_edit: boolean;
    can_delete: boolean;
    active_children_count: number;
};
type ChartEdge = {
    id: number;
    leader_id: string;
    subordinate_id: string;
    status: 'active' | 'inactive';
    relation_type: 'permanent' | 'backup';
    effective_from?: string | null;
    effective_until?: string | null;
    is_currently_effective: boolean;
    can_manage: boolean;
};
type Candidate = Omit<ChartNode, 'leader_ids' | 'inactive_leader_ids' | 'can_edit' | 'can_delete' | 'active_children_count'>;
type ChartData = {
    location: LocationOption;
    locations: LocationOption[];
    nodes: ChartNode[];
    parent_nodes: ChartNode[];
    supervisors: Candidate[];
    edges: ChartEdge[];
    candidates: Candidate[];
    job_levels: JobLevelOption[];
    layout?: ChartLayout;
    actor: { username: string; tier: Tier | 'superadmin'; is_admin: boolean };
};

type NormalizedPoint = { x: number; y: number };
type ChartLayout = {
    nodes: Record<string, NormalizedPoint>;
    edges: Record<string, EdgeRoute>;
};
type NodeGeometry = {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
};
type CardDragPreview = {
    username: string;
    left: number;
    top: number;
    deltaX: number;
    deltaY: number;
    nodePosition: NormalizedPoint;
    routes: Record<string, EdgeRoute>;
};

type SelectOption = { value: string; label: string; secondary?: string };

const tierOrder: Tier[] = ['store_manager', 'chief_operation', 'supervisor', 'service_crew'];
const CARD_WIDTH = 230;
const CARD_HEIGHT = 132;
const CANVAS_HEIGHT = 760;
const CANVAS_PADDING = 24;
const ALL_SUPERVISORS = '__all__';
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const authHeaders = (json = false): HeadersInit => ({
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const validPair = (leader: Tier, subordinate: Tier) => {
    if (leader === 'store_manager') return subordinate === 'chief_operation' || subordinate === 'supervisor';
    if (leader === 'chief_operation') return subordinate === 'supervisor';
    return leader === 'supervisor' && subordinate === 'service_crew';
};

const responseMessage = async (response: Response) => {
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    const validation = payload?.errors ? Object.values(payload.errors).flat().join(' ') : '';
    throw new Error(validation || payload?.message || 'Permintaan tidak dapat diproses.');
};

function SearchSelect({ value, options, placeholder, onChange, disabled = false }: {
    value: string;
    options: SelectOption[];
    placeholder: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listId = React.useId();
    React.useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('pointerdown', closeOutside, true);
        return () => document.removeEventListener('pointerdown', closeOutside, true);
    }, [open]);
    const selected = options.find((option) => option.value === value);
    const filtered = options.filter((option) => `${option.label} ${option.secondary || ''}`.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative" ref={rootRef} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOpen(false);
                setSearch('');
            }
        }} onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                setSearch('');
                buttonRef.current?.focus();
            }
        }}>
            <button ref={buttonRef} type="button" disabled={disabled} aria-label={placeholder} aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" onClick={() => { setOpen(!open); setSearch(''); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-bold text-gray-700 transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
                <span className="min-w-0 truncate">{selected?.label || placeholder}</span>
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-[80] mt-2 w-full min-w-[260px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl">
                    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3">
                        <Search size={15} className="text-gray-400" />
                        <input autoFocus aria-label={`Cari ${placeholder.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari..." className="w-full bg-transparent py-2.5 text-sm outline-none" />
                    </div>
                    <div id={listId} role="listbox" aria-label={placeholder} className="mt-2 max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? <p className="px-3 py-4 text-center text-xs text-gray-400">Tidak ditemukan.</p> : filtered.map((option) => (
                            <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); setSearch(''); }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-purple-50 ${option.value === value ? 'bg-purple-50 text-primary' : 'text-gray-700'}`}>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold">{option.label}</span>
                                    {option.secondary && <span className="block truncate text-[11px] text-gray-400">{option.secondary}</span>}
                                </span>
                                {option.value === value && <Check size={15} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function NodeModal({ data, node, onClose, onSaved }: {
    data: ChartData;
    node: ChartNode | Candidate | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const editing = Boolean(node && data.nodes.some((item) => item.username === node.username));
    const [username, setUsername] = useState(node?.username || data.candidates[0]?.username || '');
    const selectedUser = editing ? node : data.candidates.find((candidate) => candidate.username === username);
    const currentJobLevel = data.job_levels.find((jobLevel) => jobLevel.id === selectedUser?.job_level_id);
    const initialJobLevel = currentJobLevel?.id
        || data.job_levels.find((jobLevel) => jobLevel.tier === selectedUser?.tier && jobLevel.tier !== 'store_manager')?.id
        || 0;
    const [jobLevelId, setJobLevelId] = useState(String(initialJobLevel));
    const [leaderIds, setLeaderIds] = useState<string[]>(editing && node && 'leader_ids' in node ? node.leader_ids : []);
    const [parentSearch, setParentSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const selectedJobLevel = data.job_levels.find((jobLevel) => String(jobLevel.id) === jobLevelId);
    const targetTier = selectedJobLevel?.tier || selectedUser?.tier || 'service_crew';
    const parentOptions = data.parent_nodes.filter((parent) => parent.username !== selectedUser?.username && validPair(parent.tier, targetTier));
    const visibleParents = parentOptions.filter((parent) => `${parent.name} ${parent.username} ${parent.job_level_name || ''}`.toLowerCase().includes(parentSearch.toLowerCase()));

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedUser || !selectedJobLevel || leaderIds.length === 0) {
            setError('Pilih user, jabatan, dan minimal satu atasan.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const url = editing ? `/api/organization-chart/nodes/${selectedUser.username}` : '/api/organization-chart/nodes';
            const response = await fetch(url, {
                method: editing ? 'PATCH' : 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    location_id: data.location.initial,
                    username: selectedUser.username,
                    job_level_id: Number(jobLevelId),
                    leader_ids: leaderIds,
                }),
            });
            await responseMessage(response);
            await onSaved();
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Card tidak dapat disimpan.');
        } finally {
            setSaving(false);
        }
    };

    const changeUser = (value: string) => {
        setUsername(value);
        const candidate = data.candidates.find((item) => item.username === value);
        const candidateJobLevel = data.job_levels.find((jobLevel) => jobLevel.id === candidate?.job_level_id);
        const nextJobLevel = candidateJobLevel?.id
            || data.job_levels.find((item) => item.tier === candidate?.tier && item.tier !== 'store_manager')?.id
            || 0;
        setJobLevelId(String(nextJobLevel));
        setLeaderIds([]);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <form onSubmit={save} className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Organigram</p>
                        <h3 className="mt-1 text-xl font-black text-gray-900">{editing ? 'Edit Card' : 'Tambah Card'}</h3>
                        <p className="mt-1 text-xs text-gray-400">Nama dan NIK mengikuti Master User dan tidak dapat diubah di sini.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
                </div>
                <div className="max-h-[68vh] space-y-5 overflow-y-auto px-6 py-5">
                    {!editing && (
                        <label className="block">
                            <span className="mb-2 block text-xs font-black text-gray-600">User Cabang</span>
                            <SearchSelect value={username} placeholder="Pilih user" onChange={changeUser} options={data.candidates.map((candidate) => ({ value: candidate.username, label: `${candidate.username} - ${candidate.name}`, secondary: candidate.job_level_name || candidate.tier_label }))} />
                        </label>
                    )}
                    {selectedUser && (
                        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-gray-50 p-4">
                            <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">NIK</p><p className="mt-1 text-sm font-black text-gray-800">{selectedUser.username}</p></div>
                            <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Nama</p><p className="mt-1 text-sm font-black text-gray-800">{selectedUser.name}</p></div>
                        </div>
                    )}
                    <label className="block">
                        <span className="mb-2 block text-xs font-black text-gray-600">Jabatan</span>
                        <SearchSelect value={jobLevelId} placeholder="Pilih jabatan" onChange={(value) => { setJobLevelId(value); setLeaderIds([]); }} options={data.job_levels.filter((jobLevel) => jobLevel.tier !== 'store_manager').map((jobLevel) => ({ value: String(jobLevel.id), label: jobLevel.name, secondary: jobLevel.position_code || jobLevel.tier || 'Jabatan HR' }))} />
                    </label>
                    <div>
                        <span className="mb-2 block text-xs font-black text-gray-600">Atasan Permanen</span>
                        <div className="overflow-hidden rounded-2xl border border-gray-200">
                            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3">
                                <Search size={15} className="text-gray-400" />
                                <input value={parentSearch} onChange={(event) => setParentSearch(event.target.value)} placeholder="Cari atasan..." className="w-full bg-transparent py-3 text-sm outline-none" />
                            </div>
                            <div className="max-h-48 overflow-y-auto p-2">
                                {visibleParents.length === 0 ? <p className="px-3 py-5 text-center text-xs text-gray-400">Tidak ada atasan yang valid untuk jabatan ini.</p> : visibleParents.map((parent) => {
                                    const checked = leaderIds.includes(parent.username);
                                    return (
                                        <label key={parent.username} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-purple-50 ${checked ? 'bg-purple-50' : ''}`}>
                                            <input type="checkbox" checked={checked} onChange={() => setLeaderIds(checked ? leaderIds.filter((id) => id !== parent.username) : [...leaderIds, parent.username])} className="accent-primary" />
                                            <span className="min-w-0"><span className="block truncate text-sm font-bold text-gray-800">{parent.name}</span><span className="block text-[11px] text-gray-400">{parent.username} · {parent.tier_label}</span></span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    {error && <div className="flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-600"><AlertTriangle size={16} className="shrink-0" />{error}</div>}
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
                    <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-600">Batal</button>
                    <button disabled={saving || !selectedUser} className="rounded-xl bg-primary px-6 py-3 text-sm font-black text-white shadow-lg shadow-purple-200 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Card'}</button>
                </div>
            </form>
        </div>
    );
}

export default function OrganizationChart() {
    const [data, setData] = useState<ChartData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const [error, setError] = useState('');
    const [locationId, setLocationId] = useState('');
    const [supervisorId, setSupervisorId] = useState('');
    const loadRevisionRef = useRef(0);
    const [layoutNodes, setLayoutNodes] = useState<Record<string, NormalizedPoint>>({});
    const [edgeRoutes, setEdgeRoutes] = useState<Record<string, EdgeRoute>>({});
    const [movingCard, setMovingCard] = useState<{ username: string; offsetX: number; offsetY: number } | null>(null);
    const [movingWaypoint, setMovingWaypoint] = useState<{ edgeId: number; index: number; motion: RouteMotion } | null>(null);
    const [movingEndpoint, setMovingEndpoint] = useState<{ edgeId: number; end: EdgeEnd; motion: RouteMotion } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dragPoint, setDragPoint] = useState<NormalizedPoint | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<number | null>(null);
    const [modalNode, setModalNode] = useState<ChartNode | Candidate | null | undefined>(undefined);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const nodeRefs = useRef(new Map<string, HTMLDivElement>());
    const layoutNodesRef = useRef<Record<string, NormalizedPoint>>({});
    const edgeRoutesRef = useRef<Record<string, EdgeRoute>>({});
    const layoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
    const layoutSaveRevisionRef = useRef(0);
    const [geometry, setGeometry] = useState<Record<string, NodeGeometry>>({});
    const [geometryReady, setGeometryReady] = useState(false);
    const [cardDragPreview, setCardDragPreview] = useState<CardDragPreview | null>(null);
    const cardDragPreviewRef = useRef<CardDragPreview | null>(null);
    const [boardSize, setBoardSize] = useState({ width: 900, height: CANVAS_HEIGHT });

    const activeTiers = data ? tierOrder.filter((tier) => data.nodes.some((node) => node.tier === tier)) : [];
    const largestTier = data ? Math.max(1, ...activeTiers.map((tier) => data.nodes.filter((node) => node.tier === tier).length)) : 1;
    const requiredCanvasWidth = Math.max(900, largestTier * (CARD_WIDTH + 32) + CANVAS_PADDING * 2);

    const load = async (requestedLocation?: string, requestedSupervisor = supervisorId) => {
        const revision = ++loadRevisionRef.current;
        layoutSaveRevisionRef.current += 1;
        setLoading(true);
        setError('');
        try {
            const query = new URLSearchParams({ view: requestedSupervisor === ALL_SUPERVISORS ? 'all' : 'supervisor' });
            if (requestedLocation) query.set('location_id', requestedLocation);
            if (requestedSupervisor && requestedSupervisor !== ALL_SUPERVISORS) query.set('supervisor_id', requestedSupervisor);
            const response = await fetch(`/api/organization-chart?${query}`, { headers: authHeaders() });
            const payload = await responseMessage(response) as ChartData;
            if (revision !== loadRevisionRef.current) return;
            const nodes = payload.layout?.nodes || {};
            const edges = payload.layout?.edges || {};
            cardDragPreviewRef.current = null;
            setCardDragPreview(null);
            setMovingCard(null);
            setMovingWaypoint(null);
            setMovingEndpoint(null);
            setDraggingId(null);
            setDropTargetId(null);
            setDragPoint(null);
            setModalNode(undefined);
            setGeometryReady(false);
            setData(payload);
            setLocationId(payload.location.initial);
            setSupervisorId(requestedSupervisor);
            setLayoutNodes(nodes);
            setEdgeRoutes(edges);
            layoutNodesRef.current = nodes;
            edgeRoutesRef.current = edges;
            setSelectedEdgeId(null);
            setHoveredEdgeId(null);
        } catch (requestError) {
            if (revision !== loadRevisionRef.current) return;
            setError(requestError instanceof Error ? requestError.message : 'Organigram tidak dapat dimuat.');
        } finally {
            if (revision === loadRevisionRef.current) setLoading(false);
        }
    };

    const loadInitialChart = React.useEffectEvent(() => { void load(undefined, ''); });
    React.useEffect(() => { loadInitialChart(); }, []);

    useLayoutEffect(() => {
        if (!data || !canvasRef.current) {
            setGeometryReady(false);
            return;
        }
        const canvas = canvasRef.current;
        const update = () => {
            const measuredSize = { width: canvas.clientWidth, height: canvas.clientHeight };
            if (measuredSize.width <= 0 || measuredSize.height <= 0) {
                setGeometryReady(false);
                return;
            }
            if (measuredSize.width !== boardSize.width || measuredSize.height !== boardSize.height) {
                setGeometryReady(false);
                setBoardSize(measuredSize);
                return;
            }
            const canvasRect = canvas.getBoundingClientRect();
            const next: Record<string, NodeGeometry> = {};
            nodeRefs.current.forEach((element, id) => {
                const rect = element.getBoundingClientRect();
                next[id] = {
                    left: rect.left - canvasRect.left,
                    right: rect.right - canvasRect.left,
                    top: rect.top - canvasRect.top,
                    bottom: rect.bottom - canvasRect.top,
                    centerX: rect.left - canvasRect.left + rect.width / 2,
                    centerY: rect.top - canvasRect.top + rect.height / 2,
                };
            });
            setGeometry(next);
            setGeometryReady(data.nodes.every((node) => Boolean(next[node.username])));
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(canvas);
        nodeRefs.current.forEach((element) => observer.observe(element));
        window.addEventListener('resize', update);
        return () => { observer.disconnect(); window.removeEventListener('resize', update); };
    }, [data, layoutNodes, boardSize.width, boardSize.height, loading, supervisorId]);

    const persistLayout = (
        nodes: Record<string, NormalizedPoint> = layoutNodesRef.current,
        edges: Record<string, EdgeRoute> = edgeRoutesRef.current
    ) => {
        const revision = ++layoutSaveRevisionRef.current;
        const requestedLocation = locationId;
        const requestedSupervisor = supervisorId && supervisorId !== ALL_SUPERVISORS ? supervisorId : undefined;
        const loadRevision = loadRevisionRef.current;
        setLayoutSaving(true);
        setError('');
        const save = layoutSaveQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                try {
                    const response = await fetch('/api/organization-chart/layout', {
                        method: 'PATCH',
                        headers: authHeaders(true),
                        body: JSON.stringify({ location_id: requestedLocation, supervisor_id: requestedSupervisor, nodes, edges }),
                    });
                    const payload = await responseMessage(response) as { layout: ChartLayout };
                    if (revision !== layoutSaveRevisionRef.current || loadRevision !== loadRevisionRef.current) return;
                    const savedNodes = payload.layout?.nodes || {};
                    const savedEdges = payload.layout?.edges || {};
                    setLayoutNodes(savedNodes);
                    setEdgeRoutes(savedEdges);
                    layoutNodesRef.current = savedNodes;
                    edgeRoutesRef.current = savedEdges;
                } catch (requestError) {
                    if (revision === layoutSaveRevisionRef.current) {
                        setError(requestError instanceof Error ? requestError.message : 'Layout organigram tidak dapat disimpan.');
                    }
                } finally {
                    if (revision === layoutSaveRevisionRef.current) setLayoutSaving(false);
                }
            });
        layoutSaveQueueRef.current = save;
        return save;
    };
    const persistLayoutEvent = React.useEffectEvent(() => { void persistLayout(); });

    const mutate = async (url: string, method: string, body?: object) => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch(url, {
                method,
                headers: authHeaders(true),
                body: JSON.stringify({ location_id: locationId, ...body }),
            });
            await responseMessage(response);
            await load(locationId);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Perubahan tidak dapat disimpan.');
        } finally {
            setBusy(false);
        }
    };

    const connect = async (leaderId: string, subordinateId: string) => {
        const leader = data?.nodes.find((node) => node.username === leaderId);
        const subordinate = data?.nodes.find((node) => node.username === subordinateId);
        if (!leader || !subordinate || !validPair(leader.tier, subordinate.tier)) {
            setError('Relasi tidak valid untuk kedua tingkat jabatan tersebut.');
            return;
        }
        await mutate('/api/organization-chart/relations', 'POST', { leader_id: leaderId, subordinate_id: subordinateId });
    };
    const connectFromDrag = React.useEffectEvent((leaderId: string, subordinateId: string) => { void connect(leaderId, subordinateId); });

    React.useEffect(() => {
        if (!draggingId || !data || !canvasRef.current) return;
        const subordinate = data.nodes.find((node) => node.username === draggingId);
        if (!subordinate) return;
        const targetAt = (clientX: number, clientY: number) => {
            for (const [username, element] of nodeRefs.current) {
                const candidate = data.nodes.find((node) => node.username === username);
                if (!candidate || !validPair(candidate.tier, subordinate.tier)) continue;
                const rect = element.getBoundingClientRect();
                if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return candidate;
            }
            return null;
        };
        const move = (event: PointerEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            setDragPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
            setDropTargetId(targetAt(event.clientX, event.clientY)?.username || null);
        };
        const finish = (event: PointerEvent) => {
            const target = targetAt(event.clientX, event.clientY);
            setDraggingId(null);
            setDropTargetId(null);
            setDragPoint(null);
            if (target) connectFromDrag(target.username, subordinate.username);
        };
        const cancel = () => { setDraggingId(null); setDropTargetId(null); setDragPoint(null); };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', cancel, { once: true });
        return () => {
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', cancel);
        };
    }, [data, draggingId]);

    const captureCardRoutes = React.useEffectEvent((username: string, size: { width: number; height: number }) => {
        const initialRoutes: Record<string, { motion: RouteMotion; end: EdgeEnd }> = {};
        data?.edges.forEach((edge) => {
            if (edge.leader_id !== username && edge.subordinate_id !== username) return;
            if (edge.status !== 'active' || (edge.relation_type !== 'permanent' && !edge.is_currently_effective)) return;
            const points = edgeRoutesRef.current[String(edge.id)]?.points || defaultRoute(edge);
            const endpoints = edgeEndpoints(edge);
            const startCard = geometryFor(edge.leader_id);
            const endCard = geometryFor(edge.subordinate_id);
            if (!endpoints || !startCard || !endCard) return;
            initialRoutes[String(edge.id)] = {
                motion: createRouteMotion({ ...edgeRoutesRef.current[String(edge.id)], points }, startCard, endCard,
                    endpoints.startAnchor, endpoints.endAnchor, size),
                end: edge.leader_id === username ? 'start' : 'end',
            };
        });
        return initialRoutes;
    });

    React.useEffect(() => {
        if (!movingCard || !data || !canvasRef.current) return;
        const movableTiers = tierOrder.filter((tier) => data.nodes.some((item) => item.tier === tier));
        if (movableTiers.length === 0) return;
        const node = data.nodes.find((item) => item.username === movingCard.username);
        if (!node) return;
        const initialCanvasRect = canvasRef.current.getBoundingClientRect();
        const initialCardRect = nodeRefs.current.get(node.username)?.getBoundingClientRect();
        const initialLeft = initialCardRect ? initialCardRect.left - initialCanvasRect.left : 0;
        const initialTop = initialCardRect ? initialCardRect.top - initialCanvasRect.top : 0;
        const initialRoutes = captureCardRoutes(node.username, { width: initialCanvasRect.width, height: initialCanvasRect.height });
        layoutSaveRevisionRef.current += 1;
        const move = (event: PointerEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const laneIndex = movableTiers.indexOf(node.tier);
            const laneHeight = rect.height / movableTiers.length;
            const xRange = Math.max(1, rect.width - CARD_WIDTH - CANVAS_PADDING * 2);
            const yPadding = 12;
            const yRange = Math.max(1, laneHeight - CARD_HEIGHT - yPadding * 2);
            const left = clamp(event.clientX - rect.left - movingCard.offsetX, CANVAS_PADDING, rect.width - CARD_WIDTH - CANVAS_PADDING);
            const laneTop = laneIndex * laneHeight;
            const top = clamp(event.clientY - rect.top - movingCard.offsetY, laneTop + yPadding, laneTop + laneHeight - CARD_HEIGHT - yPadding);
            const previewRoutes: Record<string, EdgeRoute> = {};
            Object.entries(initialRoutes).forEach(([edgeId, route]) => {
                const card = {
                    left, right: left + CARD_WIDTH, top, bottom: top + CARD_HEIGHT,
                    centerX: left + CARD_WIDTH / 2, centerY: top + CARD_HEIGHT / 2,
                };
                route.motion = moveCardConnection(route.motion, route.end, card);
                previewRoutes[edgeId] = routeFromMotion(route.motion);
            });
            const preview: CardDragPreview = {
                username: node.username,
                left,
                top,
                deltaX: left - initialLeft,
                deltaY: top - initialTop,
                nodePosition: {
                    x: Number(((left - CANVAS_PADDING) / xRange).toFixed(5)),
                    y: Number(((top - laneTop - yPadding) / yRange).toFixed(5)),
                },
                routes: previewRoutes,
            };
            cardDragPreviewRef.current = preview;
            setCardDragPreview(preview);
        };
        const finish = () => {
            const preview = cardDragPreviewRef.current;
            if (preview) {
                const nextNodes = { ...layoutNodesRef.current, [preview.username]: preview.nodePosition };
                const nextRoutes = { ...edgeRoutesRef.current, ...preview.routes };
                layoutNodesRef.current = nextNodes;
                edgeRoutesRef.current = nextRoutes;
                setGeometryReady(false);
                setLayoutNodes(nextNodes);
                setEdgeRoutes(nextRoutes);
            }
            cardDragPreviewRef.current = null;
            setCardDragPreview(null);
            setMovingCard(null);
            persistLayoutEvent();
        };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        return () => {
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [data, movingCard]);

    React.useEffect(() => {
        if (!movingWaypoint || !canvasRef.current) return;
        const move = (event: PointerEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const route = moveWaypoint(movingWaypoint.motion, movingWaypoint.index, { x: event.clientX - rect.left, y: event.clientY - rect.top });
            const next = { ...edgeRoutesRef.current, [String(movingWaypoint.edgeId)]: route };
            edgeRoutesRef.current = next;
            setEdgeRoutes(next);
        };
        const finish = () => { setMovingWaypoint(null); persistLayoutEvent(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [movingWaypoint]);

    React.useEffect(() => {
        if (!movingEndpoint || !canvasRef.current) return;
        const move = (event: PointerEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const route = moveEndpoint(movingEndpoint.motion, movingEndpoint.end, { x: event.clientX - rect.left, y: event.clientY - rect.top });
            const next = { ...edgeRoutesRef.current, [String(movingEndpoint.edgeId)]: route };
            edgeRoutesRef.current = next;
            setEdgeRoutes(next);
        };
        const finish = () => { setMovingEndpoint(null); persistLayoutEvent(); };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        return () => {
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [movingEndpoint]);

    const deleteNode = async (node: ChartNode) => {
        const detail = node.active_children_count > 0 ? ` Card masih memiliki ${node.active_children_count} bawahan aktif.` : '';
        if (!window.confirm(`Hapus card ${node.name} dan seluruh relasi permanennya?${detail}`)) return;
        await mutate(`/api/organization-chart/nodes/${node.username}`, 'DELETE');
    };

    if (loading && !data) return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-gray-100 bg-white text-sm font-bold text-gray-400">Memuat organigram...</div>;
    if (!data) return <div className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-600">{error || 'Organigram tidak tersedia.'}</div>;

    const activeEdges = data.edges.filter((edge) => edge.status === 'active' && (edge.relation_type === 'permanent' || edge.is_currently_effective));
    const selectedEdge = data.edges.find((edge) => edge.id === selectedEdgeId);
    const draggingNode = data.nodes.find((node) => node.username === draggingId);
    const canvasWidth = Math.max(requiredCanvasWidth, boardSize.width);
    const laneHeight = CANVAS_HEIGHT / Math.max(1, activeTiers.length);
    const automaticPosition = (node: ChartNode): NormalizedPoint => {
        const siblings = data.nodes.filter((item) => item.tier === node.tier);
        const index = Math.max(0, siblings.findIndex((item) => item.username === node.username));
        return { x: (index + 1) / (siblings.length + 1), y: 0.5 };
    };
    const positionFor = (node: ChartNode) => layoutNodes[node.username] || automaticPosition(node);
    const cardCoordinates = (node: ChartNode) => {
        if (cardDragPreview?.username === node.username) {
            return { left: cardDragPreview.left, top: cardDragPreview.top };
        }
        const position = positionFor(node);
        const laneIndex = Math.max(0, activeTiers.indexOf(node.tier));
        const xRange = Math.max(1, canvasWidth - CARD_WIDTH - CANVAS_PADDING * 2);
        const yPadding = 12;
        const yRange = Math.max(1, laneHeight - CARD_HEIGHT - yPadding * 2);
        return {
            left: CANVAS_PADDING + position.x * xRange,
            top: laneIndex * laneHeight + yPadding + position.y * yRange,
        };
    };
    const geometryFor = (username: string) => {
        const nodeGeometry = geometry[username];
        if (!nodeGeometry || cardDragPreview?.username !== username) return nodeGeometry;
        return {
            left: nodeGeometry.left + cardDragPreview.deltaX,
            right: nodeGeometry.right + cardDragPreview.deltaX,
            top: nodeGeometry.top + cardDragPreview.deltaY,
            bottom: nodeGeometry.bottom + cardDragPreview.deltaY,
            centerX: nodeGeometry.centerX + cardDragPreview.deltaX,
            centerY: nodeGeometry.centerY + cardDragPreview.deltaY,
        };
    };
    const edgeEndpoints = (edge: ChartEdge) => {
        const leader = geometryFor(edge.leader_id);
        const subordinate = geometryFor(edge.subordinate_id);
        if (!leader || !subordinate) return null;
        const outgoing = activeEdges.filter((item) => item.leader_id === edge.leader_id);
        const incoming = activeEdges.filter((item) => item.subordinate_id === edge.subordinate_id);
        const outgoingIndex = outgoing.findIndex((item) => item.id === edge.id);
        const incomingIndex = incoming.findIndex((item) => item.id === edge.id);
        const outgoingOffset = (outgoingIndex - (outgoing.length - 1) / 2) * 16;
        const incomingOffset = (incomingIndex - (incoming.length - 1) / 2) * 16;
        const route = cardDragPreview?.routes[String(edge.id)] ?? edgeRoutes[String(edge.id)];
        const customPoints = route?.points;
        const startTarget = customPoints?.[0]
            ? { x: customPoints[0].x * boardSize.width, y: customPoints[0].y * boardSize.height }
            : { x: subordinate.centerX, y: subordinate.centerY };
        const lastCustomPoint = customPoints?.[customPoints.length - 1];
        const endTarget = lastCustomPoint
            ? { x: lastCustomPoint.x * boardSize.width, y: lastCustomPoint.y * boardSize.height }
            : { x: leader.centerX, y: leader.centerY };
        const startAnchor = route?.start_anchor ?? defaultAnchor(leader, startTarget, outgoingOffset);
        const endAnchor = route?.end_anchor ?? defaultAnchor(subordinate, endTarget, incomingOffset);
        return {
            start: anchorPoint(leader, startAnchor),
            end: anchorPoint(subordinate, endAnchor),
            startAnchor,
            endAnchor,
            horizontal: startAnchor.side === 'left' || startAnchor.side === 'right',
            routeOffset: (outgoingIndex - (outgoing.length - 1) / 2) * 12 + (incomingIndex - (incoming.length - 1) / 2) * 12,
        };
    };
    const defaultRoute = (edge: ChartEdge): NormalizedPoint[] => {
        const endpoints = edgeEndpoints(edge);
        if (!endpoints) return [];
        if (endpoints.horizontal) {
            const middleX = (endpoints.start.x + endpoints.end.x) / 2 + endpoints.routeOffset;
            return [
                { x: middleX / boardSize.width, y: endpoints.start.y / boardSize.height },
                { x: middleX / boardSize.width, y: endpoints.end.y / boardSize.height },
            ];
        }
        const middleY = (endpoints.start.y + endpoints.end.y) / 2 + endpoints.routeOffset;
        return [
            { x: endpoints.start.x / boardSize.width, y: middleY / boardSize.height },
            { x: endpoints.end.x / boardSize.width, y: middleY / boardSize.height },
        ];
    };
    const routeFor = (edge: ChartEdge) => cardDragPreview?.routes[String(edge.id)]?.points
        ?? edgeRoutes[String(edge.id)]?.points
        ?? defaultRoute(edge);
    const edgeCoordinates = (edge: ChartEdge) => {
        const endpoints = edgeEndpoints(edge);
        if (!endpoints) return null;
        const points = routeFor(edge).map((point) => ({ x: point.x * boardSize.width, y: point.y * boardSize.height }));
        return [endpoints.start, ...points, endpoints.end];
    };
    const edgePath = (edge: ChartEdge) => {
        const points = edgeCoordinates(edge);
        return points ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') : null;
    };
    const updateRoutes = (routes: Record<string, EdgeRoute>) => {
        edgeRoutesRef.current = routes;
        setEdgeRoutes(routes);
    };
    const resetRoute = (edgeId: number) => {
        const next = { ...edgeRoutesRef.current };
        delete next[String(edgeId)];
        updateRoutes(next);
        void persistLayout(layoutNodesRef.current, next);
    };
    const captureEdgeMotion = (edge: ChartEdge) => {
        const endpoints = edgeEndpoints(edge);
        const startCard = geometryFor(edge.leader_id);
        const endCard = geometryFor(edge.subordinate_id);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!endpoints || !startCard || !endCard || !rect) return null;
        const route: EdgeRoute = {
            points: [...routeFor(edge)],
            start_anchor: endpoints.startAnchor,
            end_anchor: endpoints.endAnchor,
        };
        return createRouteMotion(route, startCard, endCard, endpoints.startAnchor, endpoints.endAnchor, { width: rect.width, height: rect.height });
    };
    const beginEndpointDrag = (edge: ChartEdge, end: EdgeEnd, event: React.PointerEvent<SVGCircleElement>) => {
        const motion = captureEdgeMotion(edge);
        if (!motion || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateRoutes({ ...edgeRoutesRef.current, [String(edge.id)]: routeFromMotion(motion) });
        setMovingEndpoint({ edgeId: edge.id, end, motion });
    };
    const beginWaypointDrag = (edge: ChartEdge, index: number, event: React.PointerEvent<SVGCircleElement>) => {
        const motion = captureEdgeMotion(edge);
        if (!motion || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateRoutes({ ...edgeRoutesRef.current, [String(edge.id)]: routeFromMotion(motion) });
        setMovingWaypoint({ edgeId: edge.id, index, motion });
    };
    const distanceToSegment = (point: NormalizedPoint, start: NormalizedPoint, end: NormalizedPoint) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
        const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
        return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
    };
    const addWaypoint = (edge: ChartEdge, event: React.MouseEvent<SVGPathElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const coordinates = edgeCoordinates(edge);
        if (!rect || !coordinates) return;
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        const normalizedCoordinates = coordinates.map((item) => ({ x: item.x / rect.width, y: item.y / rect.height }));
        let segmentIndex = 0;
        let nearest = Number.POSITIVE_INFINITY;
        for (let index = 0; index < normalizedCoordinates.length - 1; index += 1) {
            const distance = distanceToSegment(point, normalizedCoordinates[index], normalizedCoordinates[index + 1]);
            if (distance < nearest) { nearest = distance; segmentIndex = index; }
        }
        const points = [...routeFor(edge)];
        points.splice(segmentIndex, 0, point);
        const next = { ...edgeRoutesRef.current, [String(edge.id)]: { ...edgeRoutesRef.current[String(edge.id)], points } };
        updateRoutes(next);
        setSelectedEdgeId(edge.id);
        void persistLayout(layoutNodesRef.current, next);
    };
    const removeWaypoint = (edge: ChartEdge, index: number) => {
        const points = routeFor(edge).filter((_, pointIndex) => pointIndex !== index);
        const next = { ...edgeRoutesRef.current, [String(edge.id)]: { ...edgeRoutesRef.current[String(edge.id)], points } };
        updateRoutes(next);
        void persistLayout(layoutNodesRef.current, next);
    };
    const draggingGeometry = draggingId ? geometry[draggingId] : null;
    const temporaryStart = draggingGeometry && dragPoint
        ? Math.abs(dragPoint.x - draggingGeometry.centerX) > Math.abs(dragPoint.y - draggingGeometry.centerY)
            ? { x: dragPoint.x >= draggingGeometry.centerX ? draggingGeometry.right : draggingGeometry.left, y: draggingGeometry.centerY }
            : { x: draggingGeometry.centerX, y: dragPoint.y >= draggingGeometry.centerY ? draggingGeometry.bottom : draggingGeometry.top }
        : null;
    const temporaryPath = temporaryStart && dragPoint
        ? `M ${temporaryStart.x} ${temporaryStart.y} L ${dragPoint.x} ${dragPoint.y}`
        : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                <div>
                    <div className="flex items-center gap-2 text-primary"><GitBranch size={18} /><p className="text-[10px] font-black uppercase tracking-[0.22em]">Struktur Cabang</p></div>
                    <h2 className="mt-1 text-xl font-black text-gray-900">Organigram Karyawan</h2>
                    <p className="mt-1 text-xs text-gray-400">Geser card atau titik sambungan pada garis terpilih. Tarik handle rantai ke card atasan untuk membuat relasi.</p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
                    {data.locations.length > 1 ? (
                        <div className="min-w-0 flex-1 sm:min-w-[240px]"><SearchSelect value={locationId} placeholder="Pilih cabang" disabled={loading || busy || layoutSaving} onChange={(value) => { void load(value, ''); }} options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))} /></div>
                    ) : <p className="text-sm font-bold text-gray-600">{data.location.initial} - {data.location.name}</p>}
                    <div className="min-w-0 flex-1 sm:min-w-[260px]"><SearchSelect value={supervisorId} placeholder="Pilih supervisor" disabled={loading || busy || layoutSaving} onChange={(value) => { void load(locationId, value); }} options={[
                        { value: '', label: 'Pilih supervisor' },
                        ...data.supervisors.map((supervisor) => ({ value: supervisor.username, label: `${supervisor.username} - ${supervisor.name}`, secondary: supervisor.job_level_name || 'Supervisor' })),
                        { value: ALL_SUPERVISORS, label: 'Seluruh cabang', secondary: 'Tampilkan semua anggota organigram' },
                    ]} /></div>
                    <button type="button" onClick={() => { layoutNodesRef.current = {}; edgeRoutesRef.current = {}; setLayoutNodes({}); setEdgeRoutes({}); void persistLayout({}, {}); }} disabled={!supervisorId || loading || busy || layoutSaving} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-xs font-black text-gray-500 transition hover:border-primary hover:text-primary disabled:opacity-50" title="Rapikan posisi dan jalur"><RotateCcw size={17} /> Rapikan</button>
                    <button type="button" onClick={() => void load(locationId)} disabled={loading || busy || layoutSaving} className="rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:border-primary hover:text-primary disabled:opacity-50" title="Muat ulang"><RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /></button>
                    <button type="button" onClick={() => setModalNode(null)} disabled={loading || busy || layoutSaving || data.candidates.length === 0} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-white shadow-lg shadow-purple-200 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={17} /> Tambah Card</button>
                </div>
            </section>

            {error && <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600"><span className="flex items-center gap-2"><AlertTriangle size={17} />{error}</span><button type="button" onClick={() => setError('')}><X size={16} /></button></div>}

            {loading || !supervisorId ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-gray-100 bg-white p-8 text-center text-sm font-bold text-gray-400">
                    {loading ? 'Memuat organigram...' : 'Pilih supervisor untuk menampilkan crew dan rantai atasannya, atau pilih Seluruh cabang.'}
                </div>
            ) : <section className="relative shrink-0 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                <div className="flex h-16 min-h-16 flex-nowrap items-center justify-between gap-3 overflow-x-auto overflow-y-hidden border-b border-gray-100 bg-white px-5 py-3">
                    <div className="flex shrink-0 items-center gap-4 text-[11px] font-bold text-gray-500">
                        <span className="flex items-center gap-2"><span className="h-0.5 w-8 bg-primary" /> Permanen aktif</span>
                        <span className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-amber-400" /> Backup</span>
                        <span>{data.edges.filter((edge) => edge.status === 'inactive').length} relasi nonaktif</span>
                        {layoutSaving && <span className="text-primary">Menyimpan layout...</span>}
                    </div>
                    <div className="ml-auto flex h-10 min-h-10 shrink-0 items-center">
                        {selectedEdge && (
                            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap rounded-xl bg-gray-50 px-3 py-2">
                                <span className="text-xs font-black text-gray-600">{selectedEdge.relation_type === 'backup' ? 'Garis backup' : 'Garis permanen'}</span>
                                <span className="text-[10px] text-gray-400">Klik ganda garis untuk menambah titik, klik ganda titik untuk menghapus.</span>
                                <button type="button" onClick={() => resetRoute(selectedEdge.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-purple-50"><RotateCcw size={13} /> Reset jalur</button>
                                {selectedEdge.can_manage && selectedEdge.relation_type === 'permanent' && <button type="button" disabled={busy} onClick={() => mutate(`/api/organization-chart/relations/${selectedEdge.id}`, 'PATCH', { status: 'inactive' })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-amber-600 hover:bg-amber-50"><Unlink size={14} /> Nonaktifkan</button>}
                                <button type="button" onClick={() => setSelectedEdgeId(null)} className="text-gray-400"><X size={14} /></button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto p-4">
                    <div ref={canvasRef} onClick={() => setSelectedEdgeId(null)} className="relative" style={{ minWidth: requiredCanvasWidth, height: CANVAS_HEIGHT }}>
                        <svg className="pointer-events-none absolute inset-0 z-30 overflow-visible" width={boardSize.width} height={boardSize.height}>
                            {geometryReady && activeEdges.map((edge) => {
                                const path = edgePath(edge);
                                if (!path) return null;
                                const selected = edge.id === selectedEdgeId;
                                const focused = selected || edge.id === hoveredEdgeId;
                                const dimmed = hoveredEdgeId !== null && !focused;
                                return (
                                    <g key={edge.id}>
                                        <path d={path} fill="none" stroke={edge.relation_type === 'backup' ? '#f59e0b' : focused ? '#5b21b6' : '#7444d4'} strokeWidth={focused ? 3.5 : 2.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={edge.relation_type === 'backup' ? '8 7' : undefined} opacity={dimmed ? 0.18 : 1} />
                                        <path d={path} fill="none" stroke="transparent" strokeWidth="16" style={{ pointerEvents: 'stroke' }} className="cursor-pointer" onMouseEnter={() => setHoveredEdgeId(edge.id)} onMouseLeave={() => setHoveredEdgeId(null)} onClick={(event) => { event.stopPropagation(); setSelectedEdgeId(edge.id); }} onDoubleClick={(event) => addWaypoint(edge, event)} />
                                        {selected && routeFor(edge).map((point, index) => (
                                            <circle key={`${edge.id}-${index}`} cx={point.x * boardSize.width} cy={point.y * boardSize.height} r="6" fill="white" stroke="#7444d4" strokeWidth="3" style={{ pointerEvents: 'all' }} className="cursor-move" onPointerDown={(event) => beginWaypointDrag(edge, index, event)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); removeWaypoint(edge, index); }} />
                                        ))}
                                    </g>
                                );
                            })}
                            {geometryReady && temporaryPath && <path d={temporaryPath} fill="none" stroke="#7444d4" strokeWidth="3" strokeLinecap="round" strokeDasharray="7 6" />}
                        </svg>

                        {data.nodes.map((node) => {
                            const coordinates = cardCoordinates(node);
                            const inactive = !activeEdges.some((edge) => edge.relation_type === 'permanent' && (edge.leader_id === node.username || edge.subordinate_id === node.username));
                            const canReceive = Boolean(draggingNode && validPair(node.tier, draggingNode.tier));
                            const canConnect = node.tier !== 'store_manager' && node.can_edit;
                            return (
                                <div key={node.username} ref={(element) => { if (element) nodeRefs.current.set(node.username, element); else nodeRefs.current.delete(node.username); }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => {
                                    if (!geometryReady || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setMovingCard({ username: node.username, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
                                }} className={`group absolute z-40 flex touch-none cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow] active:cursor-grabbing ${dropTargetId === node.username ? 'border-primary ring-4 ring-purple-100' : canReceive ? 'border-purple-200' : 'border-gray-100'}`} style={{ left: coordinates.left, top: coordinates.top, width: CARD_WIDTH, height: CARD_HEIGHT }}>
                                    <div className="flex min-h-0 flex-1 items-start gap-2">
                                        <button type="button" disabled={!canConnect || busy} onPointerDown={(event) => {
                                            if (!canConnect) return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            const point = geometry[node.username];
                                            setDraggingId(node.username);
                                            setDragPoint(point ? { x: point.centerX, y: point.top } : null);
                                        }} className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${node.tier === 'store_manager' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-primary'} ${canConnect ? 'cursor-crosshair hover:ring-2 hover:ring-purple-200' : 'cursor-default'}`} title={canConnect ? 'Tarik relasi ke card atasan' : undefined}><GripVertical size={15} /></button>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2"><p className="truncate text-xs font-black text-gray-900">{node.name}</p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase ${inactive ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'}`}>{inactive ? 'Nonaktif' : 'Aktif'}</span></div>
                                            <p className="mt-0.5 text-[11px] font-bold text-primary">{node.username}</p>
                                            <p className="mt-1 truncate text-[10px] text-gray-600"><span className="font-bold">Jabatan:</span> {node.job_level_name || node.tier_label}</p>
                                            <p className="mt-0.5 truncate text-[10px] text-gray-400"><span className="font-bold">Divisi:</span> {node.division_name || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-gray-400"><Link2 size={11} /> {node.leader_ids.length} atasan</span>
                                        <div className="flex items-center gap-0.5">
                                            {node.can_edit && <button type="button" onClick={() => setModalNode(node)} className="rounded-md p-1.5 text-gray-400 hover:bg-purple-50 hover:text-primary" title="Edit card"><Pencil size={13} /></button>}
                                            {node.can_edit && <button type="button" disabled={!node.can_delete || busy} onClick={() => deleteNode(node)} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-25" title={node.can_delete ? 'Hapus card' : 'Pindahkan bawahan atau tunggu backup selesai'}><Trash2 size={13} /></button>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {geometryReady && selectedEdge && (() => {
                            const endpoints = edgeEndpoints(selectedEdge);
                            if (!endpoints) return null;
                            return (
                                <svg className="pointer-events-none absolute inset-0 z-50 overflow-visible" width={boardSize.width} height={boardSize.height}>
                                    {(['start', 'end'] as const).map((end) => {
                                        const anchor = end === 'start' ? endpoints.startAnchor : endpoints.endAnchor;
                                        return <circle key={end} cx={endpoints[end].x} cy={endpoints[end].y} r="7" fill="#7444d4" stroke="white" strokeWidth="3"
                                            data-edge-end={end} style={{ pointerEvents: 'all' }}
                                            className={routeFor(selectedEdge).length === 0 ? 'cursor-move' : anchor.side === 'top' || anchor.side === 'bottom' ? 'cursor-ew-resize' : 'cursor-ns-resize'}
                                            onPointerDown={(event) => beginEndpointDrag(selectedEdge, end, event)}
                                            onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                                            <title>{end === 'start' ? 'Geser titik sambungan atasan' : 'Geser titik sambungan bawahan'}</title>
                                        </circle>;
                                    })}
                                </svg>
                            );
                        })()}
                    </div>
                </div>
            </section>}

            {modalNode !== undefined && <NodeModal data={data} node={modalNode} onClose={() => setModalNode(undefined)} onSaved={() => load(locationId)} />}
        </div>
    );
}
