import React, { useEffect, useState } from 'react';
import CrewList from './CrewList';
import CrewDetail from './CrewDetail';

export default function SupervisorDashboard() {
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [selectedCrewId, setSelectedCrewId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch('/api/supervisor/crews', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);

                // Only auto-select first crew if none is selected yet
                if (!selectedCrewId && data.crews && data.crews.length > 0) {
                    setSelectedCrewId(data.crews[0].id);
                }
            }
        } catch (error) {
            console.error("Failed to fetch supervisor dashboard data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCrew = (id: number) => {
        setSelectedCrewId(id);
    };

    if (loading) return <div className="h-full flex items-center justify-center text-gray-400">Loading Dashboard...</div>;
    if (!dashboardData) return <div className="h-full flex items-center justify-center text-gray-400">Failed to load data.</div>;

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
                    <CrewDetail crew={selectedCrew} onTaskChange={fetchDashboardData} />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">Select a crew to view details</div>
                )}
            </div>
        </div>
    );
}
