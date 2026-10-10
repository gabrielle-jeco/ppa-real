import { useEffect, useState } from 'react';

type TaskDefinition = {
    id: number;
    title: string;
    active: boolean;
};

type TaskArea = {
    id: number;
    name: string;
    active: boolean;
    task_definitions: TaskDefinition[];
};

type WorkStation = {
    id: number;
    name: string;
    active: boolean;
    task_areas: TaskArea[];
};

export type TaskCatalogSelection = {
    workStationId: string;
    taskAreaId: string;
    taskDefinitionId: string;
};

type TaskCatalogFieldsProps = {
    enabled: boolean;
    value: TaskCatalogSelection;
    onChange: (selection: TaskCatalogSelection) => void;
    accent?: 'purple' | 'blue';
    allowLegacy?: boolean;
    legacyTitle?: string;
};

const categoryLabel = (name: string) => name.trim().toLowerCase() === 'sc' ? 'Service Crew' : name;

export default function TaskCatalogFields({
    enabled,
    value,
    onChange,
    accent = 'purple',
    allowLegacy = false,
    legacyTitle = '',
}: TaskCatalogFieldsProps) {
    const [catalog, setCatalog] = useState<WorkStation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const focusClass = accent === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-primary';
    const selectClass = `w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm text-gray-700 outline-none focus:ring-2 ${focusClass} disabled:cursor-not-allowed disabled:text-gray-400`;

    useEffect(() => {
        if (!enabled) return;

        const controller = new AbortController();
        setLoading(true);
        setError('');

        fetch('/api/task-catalog', {
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                Accept: 'application/json',
            },
        })
            .then(async (response) => {
                if (!response.ok) throw new Error('Gagal memuat kategori, area, dan tugas.');
                return response.json();
            })
            .then((data) => setCatalog(Array.isArray(data) ? data : []))
            .catch((fetchError) => {
                if (fetchError.name !== 'AbortError') setError(fetchError.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [enabled]);

    useEffect(() => {
        if (!value.taskDefinitionId || value.taskAreaId) return;

        for (const station of catalog) {
            for (const area of station.task_areas || []) {
                if (area.task_definitions.some((definition) => String(definition.id) === value.taskDefinitionId)) {
                    onChange({
                        workStationId: String(station.id),
                        taskAreaId: String(area.id),
                        taskDefinitionId: value.taskDefinitionId,
                    });
                    return;
                }
            }
        }
    }, [catalog, onChange, value]);

    const stations = catalog.filter((station) => station.active || String(station.id) === value.workStationId);
    const selectedStation = catalog.find((station) => String(station.id) === value.workStationId);
    const areas = (selectedStation?.task_areas || []).filter((area) => area.active || String(area.id) === value.taskAreaId);
    const selectedArea = selectedStation?.task_areas?.find((area) => String(area.id) === value.taskAreaId);
    const definitions = (selectedArea?.task_definitions || []).filter((definition) => definition.active || String(definition.id) === value.taskDefinitionId);
    const required = !allowLegacy;

    return (
        <div className="space-y-3">
            {allowLegacy && !value.taskDefinitionId && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                    Tugas lama: <span className="font-bold">{legacyTitle}</span>. Pilih master task jika ingin mengganti identitas tugas.
                </p>
            )}

            <div>
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase text-gray-500">Kategori</label>
                <select
                    value={value.workStationId}
                    onChange={(event) => onChange({ workStationId: event.target.value, taskAreaId: '', taskDefinitionId: '' })}
                    className={`${selectClass} capitalize`}
                    disabled={loading}
                    required={required}
                >
                    <option value="">{loading ? 'Memuat kategori...' : 'Pilih kategori'}</option>
                    {stations.map((station) => <option key={station.id} value={station.id}>{categoryLabel(station.name)}</option>)}
                </select>
            </div>

            <div>
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase text-gray-500">Area</label>
                <select
                    value={value.taskAreaId}
                    onChange={(event) => onChange({ ...value, taskAreaId: event.target.value, taskDefinitionId: '' })}
                    className={selectClass}
                    disabled={!value.workStationId || loading}
                    required={required}
                >
                    <option value="">Pilih area</option>
                    {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
            </div>

            <div>
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase text-gray-500">Tugas</label>
                <select
                    value={value.taskDefinitionId}
                    onChange={(event) => onChange({ ...value, taskDefinitionId: event.target.value })}
                    className={selectClass}
                    disabled={!value.taskAreaId || loading}
                    required={required}
                >
                    <option value="">Pilih tugas</option>
                    {definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.title}</option>)}
                </select>
            </div>

            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
        </div>
    );
}
