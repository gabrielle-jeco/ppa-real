import React, { useState, useEffect } from 'react';
import SupervisorDashboardMobile from './SupervisorDashboardMobile';
import MobileCrewList from './MobileCrewList';
import MobileCrewDetail from './MobileCrewDetail';
import MobileCrewHistory from './MobileCrewHistory';
import MobileSupervisorReport from './MobileSupervisorReport';
import MobileCrewEvaluation from './MobileCrewEvaluation';
import MobileBackupHistory from './MobileBackupHistory';
import MobileTeamScoreDetail from './MobileTeamScoreDetail';
import MobileTeamScoreResults from './MobileTeamScoreResults';
import MobileSupervisorCashier from './MobileSupervisorCashier';
import MobilePushSellingDetail from './MobilePushSellingDetail';
import type { TeamScoreFilter, TeamScoreMember } from '../utils/teamScoreReport';

type MobileView = 'DASHBOARD' | 'EMPLOYEE_LIST' | 'CREW_DETAIL' | 'HISTORY' | 'EVALUATION' | 'REPORT'
    | 'TEAM_SCORE_RESULTS' | 'TEAM_SCORE_DETAIL' | 'BACKUP_HISTORY' | 'CASHIER' | 'PUSH_SELLING_DETAIL';
type ReportViewData = { filter: TeamScoreFilter; member?: TeamScoreMember };

const SupervisorMobileApp: React.FC = () => {
    const [currentView, setCurrentView] = useState<MobileView>('DASHBOARD');
    const [selectedCrew, setSelectedCrew] = useState<any>(null);
    const [viewData, setViewData] = useState<ReportViewData | null>(null);
    const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
    const [currentUser] = useState<any>(() => {
        const userData = localStorage.getItem('user_data');
        if (!userData) return null;

        try {
            return JSON.parse(userData);
        } catch {
            return null;
        }
    });

    useEffect(() => {
        const handleBrowserBack = (event: PopStateEvent) => {
            const state = event.state;

            if (state?.app === 'supervisor-mobile') {
                setSelectedCrew(state.selectedCrew || null);
                setViewData(state.viewData || null);
                setSelectedCampaignId(state.selectedCampaignId || null);
                setCurrentView(state.view || 'DASHBOARD');
                return;
            }

            setSelectedCrew(null);
            setViewData(null);
            setSelectedCampaignId(null);
            setCurrentView('DASHBOARD');
        };

        window.addEventListener('popstate', handleBrowserBack);
        return () => window.removeEventListener('popstate', handleBrowserBack);
    }, []);

    const handleNavigate = (view: MobileView, data?: any, pushHistory = true) => {
        const nextCrew = ['CREW_DETAIL', 'HISTORY', 'EVALUATION'].includes(view)
            ? (data ?? selectedCrew ?? null)
            : null;
        const nextViewData = ['TEAM_SCORE_RESULTS', 'TEAM_SCORE_DETAIL'].includes(view)
            ? (data ?? viewData ?? null)
            : null;
        const nextCampaignId = view === 'PUSH_SELLING_DETAIL'
            ? Number(data?.campaignId ?? selectedCampaignId)
            : null;

        if (pushHistory) {
            window.history.pushState(
                { app: 'supervisor-mobile', view, selectedCrew: nextCrew, viewData: nextViewData, selectedCampaignId: nextCampaignId },
                '',
                window.location.href
            );
        }

        setSelectedCrew(nextCrew);
        setViewData(nextViewData);
        setSelectedCampaignId(Number.isFinite(nextCampaignId) ? nextCampaignId : null);
        setCurrentView(view);
    };

    // Render Logic
    const renderContent = () => {
        switch (currentView) {
            case 'DASHBOARD':
                return <SupervisorDashboardMobile onNavigate={handleNavigate} user={currentUser} />;
            case 'EMPLOYEE_LIST':
                return <MobileCrewList onNavigate={handleNavigate} />;
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
                        onBack={() => handleNavigate('CREW_DETAIL', selectedCrew, false)}
                    />
                ) : (
                    <MobileCrewList onNavigate={handleNavigate} />
                );
            case 'EVALUATION':
                return selectedCrew ? (
                    <MobileCrewEvaluation
                        crew={selectedCrew}
                        onBack={() => handleNavigate('CREW_DETAIL', selectedCrew, false)}
                    />
                ) : (
                    <MobileCrewList onNavigate={handleNavigate} />
                );
            case 'REPORT':
                return (
                    <MobileSupervisorReport
                        onBack={() => handleNavigate('DASHBOARD', null, false)}
                        onNavigate={(view, data) => handleNavigate(view, data)}
                    />
                );
            case 'TEAM_SCORE_RESULTS':
                return viewData?.filter ? (
                    <MobileTeamScoreResults
                        filter={viewData.filter}
                        onBack={() => handleNavigate('REPORT', null, false)}
                        onSelect={(member) => handleNavigate('TEAM_SCORE_DETAIL', { filter: viewData.filter, member })}
                    />
                ) : (
                    <MobileSupervisorReport onBack={() => handleNavigate('DASHBOARD', null, false)} onNavigate={(view, data) => handleNavigate(view, data)} />
                );
            case 'TEAM_SCORE_DETAIL':
                return viewData?.filter && viewData.member ? (
                    <MobileTeamScoreDetail
                        filter={viewData.filter}
                        memberId={viewData.member.id}
                        onBack={() => handleNavigate('TEAM_SCORE_RESULTS', { filter: viewData.filter }, false)}
                    />
                ) : (
                    <MobileSupervisorReport onBack={() => handleNavigate('DASHBOARD', null, false)} onNavigate={(view, data) => handleNavigate(view, data)} />
                );
            case 'BACKUP_HISTORY':
                return <MobileBackupHistory onBack={() => handleNavigate('REPORT', null, false)} />;
            case 'CASHIER':
                return <MobileSupervisorCashier onBack={() => handleNavigate('DASHBOARD', null, false)} onSelect={(campaign) => handleNavigate('PUSH_SELLING_DETAIL', { campaignId: campaign.id })} />;
            case 'PUSH_SELLING_DETAIL':
                return selectedCampaignId ? <MobilePushSellingDetail campaignId={selectedCampaignId} onBack={() => handleNavigate('CASHIER', null, false)} /> : <MobileSupervisorCashier onBack={() => handleNavigate('DASHBOARD', null, false)} onSelect={(campaign) => handleNavigate('PUSH_SELLING_DETAIL', { campaignId: campaign.id })} />;
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
