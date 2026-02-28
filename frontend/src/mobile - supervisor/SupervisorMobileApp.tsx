import React, { useState, useEffect } from 'react';
import SupervisorDashboardMobile from './SupervisorDashboardMobile';
import MobileCrewList from './MobileCrewList';
import MobileCrewDetail from './MobileCrewDetail';
import MobileChecklist from './MobileChecklist';
import MobileCrewHistory from './MobileCrewHistory';
import MobileSupervisorReport from './MobileSupervisorReport';
import MobileCrewEvaluation from './MobileCrewEvaluation';

type MobileView = 'DASHBOARD' | 'EMPLOYEE_LIST' | 'CREW_DETAIL' | 'HISTORY' | 'EVALUATION' | 'CHECKLIST' | 'REPORT';

const SupervisorMobileApp: React.FC = () => {
    const [currentView, setCurrentView] = useState<MobileView>('DASHBOARD');
    const [selectedCrew, setSelectedCrew] = useState<any>(null);
    const [supervisor, setSupervisor] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Fetch Supervisor Info on Mount
    useEffect(() => {
        const userData = localStorage.getItem('user_data');
        if (userData) {
            setCurrentUser(JSON.parse(userData));
        }
        fetchSupervisorInfo();
    }, []);

    const fetchSupervisorInfo = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/supervisor/crews', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSupervisor(data.supervisor);
            }
        } catch (error) {
            console.error("Failed to fetch supervisor info", error);
        }
    };

    const handleNavigate = (view: MobileView, data?: any) => {
        if (data) setSelectedCrew(data);
        setCurrentView(view);
    };

    // Render Logic
    const renderContent = () => {
        switch (currentView) {
            case 'DASHBOARD':
                return <SupervisorDashboardMobile onNavigate={handleNavigate} user={currentUser} />;
            case 'EMPLOYEE_LIST':
                return <MobileCrewList onNavigate={handleNavigate} />;
            case 'CHECKLIST':
                return <MobileChecklist supervisor={supervisor} onNavigate={handleNavigate} />;
            case 'CREW_DETAIL':
                return selectedCrew ? (
                    <MobileCrewDetail
                        crew={selectedCrew}
                        onNavigate={handleNavigate}
                    />
                ) : (
                    <MobileCrewList onNavigate={handleNavigate} />
                );
            case 'HISTORY':
                return selectedCrew ? (
                    <MobileCrewHistory
                        crew={selectedCrew}
                        onBack={() => handleNavigate('CREW_DETAIL', selectedCrew)}
                    />
                ) : (
                    <MobileCrewList onNavigate={handleNavigate} />
                );
            case 'EVALUATION':
                return selectedCrew ? (
                    <MobileCrewEvaluation
                        crew={selectedCrew}
                        onBack={() => handleNavigate('CREW_DETAIL', selectedCrew)}
                    />
                ) : (
                    <MobileCrewList onNavigate={handleNavigate} />
                );
            case 'REPORT':
                return (
                    <MobileSupervisorReport
                        onBack={() => handleNavigate('DASHBOARD')}
                        supervisorId={supervisor?.id || 1}
                    />
                );
            default:
                return <SupervisorDashboardMobile onNavigate={handleNavigate} user={currentUser} />;
        }
    };

    return (
        <>
            {renderContent()}
        </>
    );
};

export default SupervisorMobileApp;
