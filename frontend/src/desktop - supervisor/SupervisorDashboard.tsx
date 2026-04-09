import React, { useMemo, useState } from 'react';
import CrewList from './CrewList';
import CrewDetail from './CrewDetail';
import { createSupervisorDashboardDummyData } from './dummySupervisorDashboard';

interface SupervisorDashboardProps {
    user?: {
        name?: string;
    } | null;
}

export default function SupervisorDashboard({ user }: SupervisorDashboardProps) {
    const dashboardData = useMemo(
        () => createSupervisorDashboardDummyData(user?.name),
        [user?.name]
    );
    const [selectedCrewId, setSelectedCrewId] = useState<number | null>(
        dashboardData.crews[0]?.id ?? null
    );

    const handleSelectCrew = (id: number) => {
        setSelectedCrewId(id);
    };

    const selectedCrew = dashboardData.crews.find((c: any) => c.id === selectedCrewId);

    return (
        <div className="flex h-full w-full bg-gray-50 border-t border-gray-200">
            {/* Left: Crew List */}
            <CrewList
                data={dashboardData}
                selectedId={selectedCrewId}
                onSelect={handleSelectCrew}
            />

            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                {selectedCrew ? (
                    <CrewDetail crew={selectedCrew} />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">Select a crew to view details</div>
                )}
            </div>
        </div>
    );
}
