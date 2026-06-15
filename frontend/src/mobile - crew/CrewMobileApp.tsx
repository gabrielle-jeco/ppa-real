import React, { useState, useEffect } from 'react';
import CrewLayout from './CrewLayout';
import CrewDashboardMobile from './CrewDashboardMobile';
import MobileTaskList from './MobileTaskList';
import MobileTaskExecution from './MobileTaskExecution';
import MobileCrewHistory from './MobileCrewHistory';
import MobileCrewEvaluation from './MobileCrewEvaluation';
import MobileTaskGuide from './MobileTaskGuide';
import MobileEvidenceListModal from './MobileEvidenceListModal';


interface CrewMobileAppProps {
    user: any;
    onLogout?: () => void;
}

export default function CrewMobileApp({ user, onLogout }: CrewMobileAppProps) {
    // Navigation State
    const [activePage, setActivePage] = useState<'dashboard' | 'history' | 'evaluation' | 'task-list' | 'guide'>('dashboard');
    const [selectedTask, setSelectedTask] = useState<any>(null); // For Execution Modal
    const [refreshTrigger, setRefreshTrigger] = useState(0); // For forcing child list refresh

    // Shared State (Persisted to prevent reset on refresh)
    const [selectedRole, setSelectedRole] = useState(() => {
        return localStorage.getItem('CREW_LAST_ROLE') || 'cashier';
    });

    // Initial Login Activity Log (Checks DB for duplicates)
    useEffect(() => {
        const logInitialActivity = async () => {
            const isFreshLogin = sessionStorage.getItem('just_logged_in') === 'true';

            // Remove immediately to prevent React 18 Strict Mode double-firing
            if (isFreshLogin) {
                sessionStorage.removeItem('just_logged_in');
            }

            try {
                await fetch('/api/crew/activity', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    },
                    body: JSON.stringify({
                        work_station_name: selectedRole,
                        is_initial_login: true,
                        force_log: isFreshLogin
                    })
                });
            } catch (e) {
                console.error("Failed to log initial activity", e);
            }
        };
        logInitialActivity();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    useEffect(() => {
        const handleBrowserBack = (event: PopStateEvent) => {
            const state = event.state;

            if (state?.app === 'crew-mobile') {
                setActivePage(state.page || 'dashboard');
                setSelectedTask(state.selectedTask || null);
                return;
            }

            setActivePage('dashboard');
            setSelectedTask(null);
        };

        window.addEventListener('popstate', handleBrowserBack);
        return () => window.removeEventListener('popstate', handleBrowserBack);
    }, []);

    const pushCrewHistory = (page: typeof activePage, task: any = null) => {
        window.history.pushState(
            { app: 'crew-mobile', page, selectedTask: task },
            '',
            window.location.href
        );
    };

    // Handlers
    const handleRoleChange = async (role: string) => {
        setSelectedRole(role);
        localStorage.setItem('CREW_LAST_ROLE', role);
        try {
            await fetch('/api/crew/activity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ work_station_name: role })
            });
        } catch (error) {
            console.error('Failed to log workstation change', error);
        }
    };

    const handleNavigate = (page: 'dashboard' | 'history' | 'evaluation' | 'task-list' | 'guide', pushHistory = true) => {
        if (pushHistory) {
            pushCrewHistory(page);
        }
        setActivePage(page);
        setSelectedTask(null);
    };

    const handleSelectTask = (task: any, selectedDate?: string) => {
        const taskWithViewDate = selectedDate ? { ...task, _selected_date: selectedDate } : task;
        pushCrewHistory(activePage, taskWithViewDate);
        setSelectedTask(taskWithViewDate);
    };

    const handleUploadEvidence = async (formData: FormData) => {
        if (!selectedTask) return;

        try {
            // Call API
            const response = await fetch(`/api/tasks/${selectedTask.task_id}/evidence`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText);
            }

            // Successfully uploaded, get the fresh task data and update modal immediately
            const updatedTask = await response.json();
            setSelectedTask(updatedTask);
            // Trigger refresh for underlying lists
            setRefreshTrigger(prev => prev + 1);
        } catch (error: any) {
            console.error(error);
            let errorMessage = "Gagal mengunggah foto. Silakan coba lagi.";
            try {
                const parsed = JSON.parse(error.message);
                if (parsed.message) errorMessage = parsed.message;
            } catch (e) {
                if (error.message) errorMessage = error.message;
            }
            alert(errorMessage);
            throw error;
        }
    };

    const handleDeleteEvidence = async (evidenceId: number) => {
        if (!selectedTask) return;

        try {
            const response = await fetch(`/api/tasks/${selectedTask.task_id}/evidence`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ evidence_id: evidenceId })
            });

            if (!response.ok) {
                throw new Error("Failed to delete image");
            }

            // Immediately fetch the updated task
            const updatedTask = await response.json();
            setSelectedTask(updatedTask.task); // API returns {'message': ..., 'task': {...}}
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error(error);
            alert("Gagal menghapus foto.");
            throw error;
        }
    };

    // Render Content based on Route
    const renderContent = () => {
        switch (activePage) {
            case 'dashboard':
                return (
                    <CrewDashboardMobile
                        user={user}
                        onNavigate={handleNavigate}
                        selectedRole={selectedRole}
                        onRoleChange={handleRoleChange}
                        onLogout={onLogout}
                    />
                );
            case 'task-list':
                return (
                    <MobileTaskList
                        user={user}
                        onBack={() => handleNavigate('dashboard', false)}
                        onSelectTask={handleSelectTask}
                        refreshTrigger={refreshTrigger}
                        selectedRole={selectedRole}
                    />
                );
            case 'history':
                return (
                    <MobileCrewHistory
                        user={user}
                        onBack={() => handleNavigate('dashboard', false)}
                        onSelectTask={handleSelectTask}
                        refreshTrigger={refreshTrigger}
                        selectedRole={selectedRole}
                    />
                );
            case 'evaluation':
                return <MobileCrewEvaluation user={user} onBack={() => handleNavigate('dashboard', false)} />;
            case 'guide':
                return (
                    <MobileTaskGuide
                        onBack={() => handleNavigate('dashboard', false)}
                        role={selectedRole}
                    />
                );
            default:
                return <div>Page Not Found</div>;
        }
    };

    return (
        <>
            {/* Main Page Content */}
            {renderContent()}

            {/* Task Execution Modal (Overlay) */}
            {selectedTask && (
                <MobileTaskExecution
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onUpload={handleUploadEvidence}
                    onDelete={handleDeleteEvidence}
                />
            )}
        </>
    );
}
