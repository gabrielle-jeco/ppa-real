import EvaluationRequestButton from '../general/EvaluationRequestButton';
import CrewList from '../desktop - supervisor/CrewList';
import { SearchableSelect } from './SupervisorList';
import SupervisorAssignedTasks from '../general/SupervisorAssignedTasks';
import type { AssignmentRecipient } from '../utils/managerAssignments';

interface Props {
    data: { manager: { name: string; role: string; type: string }; location_name: string; location_avg_progress: number };
    supervisors: AssignmentRecipient[];
    locations: { id?: string; initial?: string; name: string }[];
    selectedId: string | null;
    locationId: string;
    active?: boolean;
    onSelect: (id: string) => void;
    onLocation: (id: string) => void;
    onChanged?: () => void;
    pendingRequestCount: number;
    onOpenRequests: () => void;
}

export default function ManagerAssignments({
    data,
    supervisors,
    locations,
    selectedId,
    locationId,
    active = true,
    onSelect,
    onLocation,
    onChanged,
    pendingRequestCount,
    onOpenRequests,
}: Props) {
    const selected = supervisors.find((supervisor) => supervisor.id === selectedId);
    const locationOptions = [
        { value: '', label: 'Semua Lokasi' },
        ...locations.map((location) => ({ value: location.id || location.initial || '', label: location.name })),
    ];

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <CrewList
                headerAction={<EvaluationRequestButton pendingRequestCount={pendingRequestCount} onOpenRequests={onOpenRequests} />}
                compactHeader
                heading="Supervisor"
                data={{
                    supervisor: data.manager,
                    location_name: data.location_name,
                    location_avg_progress: data.location_avg_progress ?? 0,
                    crews: supervisors.map((supervisor) => ({ ...supervisor, role: supervisor.role || 'Supervisor' })),
                }}
                selectedId={selectedId}
                onSelect={onSelect}
                welcomeLabel={`Selamat datang, ${data.manager?.role || 'Manager'}`}
                locationControl={data.manager?.type === 'RM'
                    ? (
                        <SearchableSelect
                            value={locationId}
                            options={locationOptions}
                            placeholder="Semua Lokasi"
                            searchPlaceholder="Cari lokasi..."
                            onChange={onLocation}
                        />
                    )
                    : undefined}
                searchPlaceholder="Cari nama atau NIK supervisor..."
                emptyLabel="Supervisor tidak ditemukan."
            />
            {selected
                ? <SupervisorAssignedTasks supervisor={selected} reviewer recipients={supervisors} locationId={locationId} active={active} onChanged={onChanged} />
                : <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Pilih supervisor untuk melihat penugasan.</div>}
        </div>
    );
}
