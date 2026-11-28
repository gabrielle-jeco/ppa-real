import React, { useEffect, useRef, useState } from 'react';
import SupervisorAssignedTasks from '../general/SupervisorAssignedTasks';
import CrewTaskExportModal from '../general/CrewTaskExportModal';
import CrewList from './CrewList';
import CrewDetail from './CrewDetail';

export default function SupervisorDashboard() {
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'crew' | 'assigned'>('crew');
    const [assignedMounted, setAssignedMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const refreshTimerRef = useRef<number | null>(null);

    useEffect(() => {
        fetchDashboardData();

        return () => {
            if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
        };
    }, []);

    const scheduleDashboardRefresh = () => {
        if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = window.setTimeout(() => {
            refreshTimerRef.current = null;
            fetchDashboardData();
        }, 1000);
    };

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
            console.error("Gagal mengambil data dashboard supervisor", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCrew = (id: string) => {
        setSelectedCrewId(id);
    };

    if (loading) return <div className="h-full flex items-center justify-center text-gray-400">Memuat dashboard...</div>;
    if (!dashboardData) return <div className="h-full flex items-center justify-center text-gray-400">Gagal memuat data.</div>;

    const selectedCrew = dashboardData.crews.find((c: any) => c.id === selectedCrewId);

    return (
        <div className="flex h-full w-full flex-col bg-gray-50 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-2 border-b bg-white p-3" role="tablist" aria-label="Dashboard Supervisor">
                <button role="tab" aria-selected={activeTab === 'crew'} onClick={() => setActiveTab('crew')} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'crew' ? 'bg-primary text-white' : 'text-gray-500'}`}>Penugasan Crew</button>
                <button role="tab" aria-selected={activeTab === 'assigned'} onClick={() => { setAssignedMounted(true); setActiveTab('assigned'); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'assigned' ? 'bg-primary text-white' : 'text-gray-500'}`}>Tugas dari Manager</button>
                <div className="ml-auto"><CrewTaskExportModal /></div>
            </div>
            {assignedMounted && (
                <div className={`${activeTab === 'assigned' ? 'flex' : 'hidden'} min-h-0 flex-1`}>
                    <SupervisorAssignedTasks supervisor={dashboardData.supervisor} active={activeTab === 'assigned'} />
                </div>
            )}
            <div className={`${activeTab === 'crew' ? 'flex' : 'hidden'} min-h-0 flex-1`}>
            {/* Left: Crew List */}
            <CrewList
                data={dashboardData}
                selectedId={selectedCrewId}
                onSelect={handleSelectCrew}
            />

            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                {selectedCrew ? (
                    <CrewDetail crew={selectedCrew} crews={dashboardData.crews || []} onTaskChange={scheduleDashboardRefresh} />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">Pilih karyawan untuk melihat detail.</div>
                )}
            </div>
            </div>
        </div>
    );
}
