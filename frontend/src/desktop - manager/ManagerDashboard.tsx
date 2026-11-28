import React, { useEffect, useRef, useState } from 'react';
import ManagerAssignments from './ManagerAssignments';
import SupervisorList from './SupervisorList';
import SupervisorDetail from './SupervisorDetail';
import EvaluationReopenRequestsModal from './EvaluationReopenRequestsModal';

export default function ManagerDashboard() {
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null);
    const [selectedLocationId, setSelectedLocationId] = useState<string>(""); // "" for All
    const [activeTab, setActiveTab] = useState<'monitoring' | 'assignments'>('monitoring');
    const [assignmentsMounted, setAssignmentsMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [crewRows, setCrewRows] = useState<any[]>([]);
    const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
    const [pendingRequestCount, setPendingRequestCount] = useState(0);
    const [requestsOpen, setRequestsOpen] = useState(false);
    const dashboardRequestRef = useRef(0);
    const requestCountRequestRef = useRef(0);

    useEffect(() => {
        fetchDashboardData();
        fetchRequestCount();
    }, []);

    const fetchRequestCount = async () => {
        const requestId = ++requestCountRequestRef.current;
        try {
            const response = await fetch('/api/manager/evaluation-reopen-requests?status=pending', {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
            });
            if (response.ok) {
                const payload = await response.json();
                if (requestId !== requestCountRequestRef.current) return;
                setPendingRequestCount(payload.pending_count || 0);
            }
        } catch (error) {
            console.error('Failed to fetch evaluation request count', error);
        }
    };

    const fetchDashboardData = async (locationId?: string) => {
        const requestId = ++dashboardRequestRef.current;
        const filterLocation = locationId !== undefined ? locationId : selectedLocationId;
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const url = filterLocation
                ? `/api/manager/supervisors?location_id=${filterLocation}`
                : `/api/manager/supervisors`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (requestId !== dashboardRequestRef.current) return;
                setDashboardData(data);
                const nextSupervisorId = selectedSupervisorId && data.supervisors?.some((supervisor: any) => supervisor.id === selectedSupervisorId)
                    ? selectedSupervisorId
                    : data.supervisors?.[0]?.id || null;
                if (nextSupervisorId !== selectedSupervisorId) {
                    setCrewRows([]);
                    setSelectedCrewId(null);
                }
                setSelectedSupervisorId(nextSupervisorId);
            }
        } catch (error) {
            if (requestId !== dashboardRequestRef.current) return;
            console.error("Failed to fetch dashboard data", error);
        } finally {
            if (requestId === dashboardRequestRef.current) setLoading(false);
        }
    };

    const handleSelectSupervisor = (id: string) => {
        setSelectedSupervisorId(id);
        setCrewRows([]);
        setSelectedCrewId(null);
    };

    const handleFilterLocation = (locationId: string) => {
        setSelectedLocationId(locationId);
        fetchDashboardData(locationId);
    };

    if (loading) return <div className="h-full flex items-center justify-center text-gray-400">Loading Dashboard...</div>;
    if (!dashboardData) return <div className="h-full flex items-center justify-center text-gray-400">Failed to load data.</div>;

    const selectedSupervisor = dashboardData.supervisors.find((s: any) => s.id === selectedSupervisorId);

    return (
        <div className="flex h-full w-full flex-col bg-gray-50 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-2 border-b bg-white p-3" role="tablist" aria-label="Dashboard Manager">
                <button role="tab" aria-selected={activeTab === 'monitoring'} onClick={() => setActiveTab('monitoring')} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'monitoring' ? 'bg-primary text-white' : 'text-gray-500'}`}>Monitoring Crew</button>
                <button role="tab" aria-selected={activeTab === 'assignments'} onClick={() => { setAssignmentsMounted(true); setActiveTab('assignments'); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === 'assignments' ? 'bg-primary text-white' : 'text-gray-500'}`}>Penugasan Supervisor</button>
            </div>
            {assignmentsMounted && (
                <div className={`${activeTab === 'assignments' ? 'flex' : 'hidden'} min-h-0 flex-1`}>
                    <ManagerAssignments
                        pendingRequestCount={pendingRequestCount}
                        onOpenRequests={() => setRequestsOpen(true)}
                        data={dashboardData}
                        supervisors={dashboardData.supervisors}
                        locations={dashboardData.locations || []}
                        selectedId={selectedSupervisorId}
                        locationId={selectedLocationId}
                        active={activeTab === 'assignments'}
                        onSelect={handleSelectSupervisor}
                        onLocation={handleFilterLocation}
                        onChanged={() => fetchDashboardData()}
                    />
                </div>
            )}
            <div className={`${activeTab === 'monitoring' ? 'flex' : 'hidden'} min-h-0 flex-1`}>

            {/* Left: Supervisor List */}
            <SupervisorList
                data={dashboardData}
                selectedId={selectedSupervisorId}
                onSelect={handleSelectSupervisor}
                selectedLocationId={selectedLocationId}
                onFilterLocation={handleFilterLocation}
                crews={crewRows}
                selectedCrewId={selectedCrewId}
                onSelectCrew={setSelectedCrewId}
                pendingRequestCount={pendingRequestCount}
                onOpenRequests={() => setRequestsOpen(true)}
            />

            {/* Right: Detailed View */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {selectedSupervisor ? (
                    <SupervisorDetail
                        supervisor={selectedSupervisor}
                        selectedCrewId={selectedCrewId}
                        onSelectCrew={setSelectedCrewId}
                        onCrewRowsChange={setCrewRows}
                        onTaskChange={() => fetchDashboardData()}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">Select a supervisor to view details</div>
                )}
            </div>
            </div>
            <EvaluationReopenRequestsModal open={requestsOpen} onClose={() => setRequestsOpen(false)} onChanged={fetchRequestCount} />
        </div>
    );
}
