import React, { useEffect, useState, useRef } from 'react';
import ServerClock from './ServerClock';
import { Activity, BookOpenCheck, Calculator, Check, ChevronDown, Download, FileSpreadsheet, GitBranch, Layers3, LogOut, MapPinned, PanelLeftClose, PanelLeftOpen, RefreshCcw, Save, ShieldCheck, Upload, UserCog, UserPlus, UsersRound, X } from 'lucide-react';

type Tab = 'users' | 'jobLevels' | 'divisions' | 'appRoles' | 'hierarchy' | 'guides' | 'locations' | 'regionals' | 'evaluations' | 'scoring' | 'activity';

const TAB_PERMISSIONS: Record<Tab, string> = {
    users: 'users_locations',
    jobLevels: 'job_levels',
    divisions: 'divisions',
    appRoles: 'app_roles',
    hierarchy: 'reporting_lines',
    guides: 'work_stations',
    locations: 'locations',
    regionals: 'regionals',
    evaluations: 'evaluation_masters',
    scoring: 'scoring_masters',
    activity: 'user_activity',
};

const TAB_ORDER: Tab[] = ['users', 'jobLevels', 'divisions', 'appRoles', 'hierarchy', 'guides', 'locations', 'regionals', 'evaluations', 'scoring', 'activity'];

type JobLevel = {
    id: number;
    name: string;
    description?: string;
    position_code?: string | null;
    grade?: string | null;
    department?: string | null;
    visible_in_yodaily?: boolean;
    external_active?: boolean;
    synced_at?: string | null;
};

type Division = {
    id: number;
    code: string;
    name: string;
    group_code: string;
    parent_id?: number | null;
    parent_name?: string | null;
    sort_order: number;
    visible_in_yodaily: boolean;
};

type ReportingUserOption = {
    username: string;
    name: string;
    role_type: string;
    division_name?: string | null;
    division_group_code?: string | null;
};

type AccountRole = {
    id: number;
    name: string;
    description?: string | null;
    permissions: string[];
    users_count?: number;
};

type AppRole = {
    id: number;
    name: string;
    description?: string | null;
    active: boolean;
    users_count?: number;
};

type Location = {
    initial: string;
    name: string;
    city?: string;
    store_code?: number;
    address?: string;
    phone?: string;
    region_code?: number;
    is_active?: number | boolean;
    type_store?: string;
};

type CmsUser = {
    username: string;
    name: string;
    email?: string | null;
    initial_store?: string | null;
    job_level_id?: number | null;
    division_id?: number | null;
    role_id?: number | null;
    account_role?: string | null;
    job_level_name?: string;
    job_level_position_code?: string | null;
    division_code?: string | null;
    division_name?: string | null;
    division_group_code?: string | null;
    role_type?: string;
    active: boolean;
    is_back_office: boolean;
    locations: Array<{ initial: string; name: string }>;
    leader?: { username: string; name: string } | null;
    subordinates_count: number;
};

type UserLocationAssignment = {
    id: number;
    user_id: string;
    user_name?: string;
    location_id: string;
    location_name?: string;
    job_level?: string | null;
};

type Regional = {
    id: number;
    kode_regional: string;
    nama_regional: string;
    cabang?: string | null;
};

type ReportingLine = {
    id: number;
    leader_id: string;
    leader_name?: string;
    leader_role_type?: string;
    leader_division_name?: string | null;
    leader_division_group_code?: string | null;
    subordinate_id: string;
    subordinate_name?: string;
    subordinate_role_type?: string;
    subordinate_division_name?: string | null;
    subordinate_division_group_code?: string | null;
    status: 'active' | 'inactive';
};

type ReportingImportIssue = {
    row: number;
    subordinate_id?: string;
    leader_id?: string;
    reason: string;
};

type ReportingImportPreview = {
    summary: {
        relations: number;
        valid: number;
        duplicates: number;
        invalid: number;
    };
    valid_rows: ReportingImportIssue[];
    duplicate_rows: ReportingImportIssue[];
    invalid_rows: ReportingImportIssue[];
    details_limited: boolean;
};

type WorkStation = {
    id: number;
    name: string;
    guide_content: string[];
    active: boolean;
    task_areas?: TaskArea[];
};

type TaskDefinition = {
    id: number;
    task_area_id: number;
    title: string;
    sort_order: number;
    active: boolean;
};

type TaskArea = {
    id: number;
    work_station_id: number;
    name: string;
    sort_order: number;
    active: boolean;
    task_definitions: TaskDefinition[];
};

type EvaluationMaster = {
    id: number;
    key: string;
    title: string;
    subtitle: string;
    question: string;
    answers: string[];
    sort_order: number;
    active: boolean;
};

type ScoringRule = {
    id: number;
    effective_from: string;
    task_weight: number;
    attendance_weight: number;
    evaluation_weight: number;
    attendance_target: number;
    attendance_included_statuses: string[];
    task_excluded_statuses: string[];
    cashier_task_weight: number;
    cashier_ibop_weight: number;
    cashier_push_selling_weight: number;
    created_by?: string | null;
    created_at?: string | null;
};

type UserActivityRow = {
    id?: number;
    username: string;
    name: string;
    role_type?: string | null;
    account_role?: string | null;
    app_roles?: string[];
    locations?: Array<{ initial: string; name: string }>;
    device_type?: string | null;
    last_url?: string | null;
    last_seen_at?: string | null;
    last_seen_label?: string | null;
    latest_login_at?: string | null;
    latest_login_label?: string | null;
    login_source?: string | null;
    login_count?: number;
    ip_address?: string | null;
};

type CmsData = {
    stats: {
        users: number;
        active_users: number;
        locations: number;
        reporting_lines: number;
        work_stations: number;
        user_locations: number;
        regionals: number;
        account_roles: number;
        app_roles: number;
        evaluation_masters: number;
        scoring_rules: number;
        job_levels: number;
        divisions: number;
        online_users?: number;
    };
    roles: AccountRole[];
    app_roles: AppRole[];
    cms_permissions: Array<{ key: string; label: string }>;
    current_account_role?: string | null;
    current_permissions: string[];
    job_levels: JobLevel[];
    divisions: Division[];
    locations: Location[];
    work_stations: WorkStation[];
    app_job_levels: string[];
    regionals: Regional[];
    evaluation_masters: EvaluationMaster[];
    scoring_rules: ScoringRule[];
    attendance_statuses: string[];
};

const emptyUserForm = {
    username: '',
    name: '',
    email: '',
    password: '',
    initial_store: '',
    role_id: '',
    job_level_id: '',
    division_id: '',
    active: true,
    is_back_office: false,
    location_ids: [] as string[],
};

const emptyEvaluationForm = {
    id: '',
    title: 'MONTHLY EVALUATION',
    subtitle: 'SIKAP KEPRIBADIAN',
    question: '',
    answers: [''],
    sort_order: '',
    active: true,
};

const emptyScoringForm = {
    effective_from: new Date().toISOString().slice(0, 7) + '-01',
    task_weight: '60',
    attendance_weight: '25',
    evaluation_weight: '15',
    attendance_target: '25',
    attendance_included_statuses: ['H', 'O', 'OP', 'CT'],
    task_excluded_statuses: ['O', 'OP', 'CT'],
    cashier_task_weight: '33.3333',
    cashier_ibop_weight: '33.3333',
    cashier_push_selling_weight: '33.3334',
};

const scoringFormFromRule = (rule?: ScoringRule) => rule ? {
    effective_from: rule.effective_from,
    task_weight: String(rule.task_weight),
    attendance_weight: String(rule.attendance_weight),
    evaluation_weight: String(rule.evaluation_weight),
    attendance_target: String(rule.attendance_target),
    attendance_included_statuses: rule.attendance_included_statuses.filter((status) => status !== 'OFF'),
    task_excluded_statuses: rule.task_excluded_statuses.filter((status) => status !== 'OFF'),
    cashier_task_weight: String(rule.cashier_task_weight),
    cashier_ibop_weight: String(rule.cashier_ibop_weight),
    cashier_push_selling_weight: String(rule.cashier_push_selling_weight),
} : { ...emptyScoringForm };

const nextScoringEffectiveDate = (rules: ScoringRule[]) => {
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const latestMonth = rules[0] ? new Date(`${rules[0].effective_from}T00:00:00`) : null;
    const nextMonth = latestMonth && latestMonth >= currentMonth
        ? new Date(latestMonth.getFullYear(), latestMonth.getMonth() + 1, 1)
        : currentMonth;

    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
};

const emptyRoleForm = {
    id: '',
    name: '',
    description: '',
    permissions: [] as string[],
};

const emptyAppRoleForm = {
    id: '',
    name: '',
    description: '',
    active: true,
};

function operationalRoleLabel(roleType?: string | null) {
    const normalized = String(roleType || '').trim().toLowerCase();
    if (normalized === 'employee' || normalized === 'sc') return 'Service Crew';
    if (normalized === 'supervisor') return 'Supervisor';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'superadmin') return 'Superadmin';

    return normalized ? normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function userIdentityLabel(user: { username: string; name: string; role_type?: string | null; division_group_code?: string | null }) {
    const roleAndGroup = [operationalRoleLabel(user.role_type), user.division_group_code].filter(Boolean).join(' ');
    return `${user.username} - ${user.name}${roleAndGroup ? ` (${roleAndGroup})` : ''}`;
}

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [sidebarExpanded, setSidebarExpanded] = useState(() => localStorage.getItem('yodaily_cms_sidebar_expanded') === 'true');
    const [data, setData] = useState<CmsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!message) return;
        const timeout = window.setTimeout(() => setMessage(''), 5000);
        return () => window.clearTimeout(timeout);
    }, [message]);
    
    const [usersData, setUsersData] = useState<CmsUser[]>([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersTotalPages, setUsersTotalPages] = useState(1);
    const [usersSearch, setUsersSearch] = useState('');

    const [jobLevelsData, setJobLevelsData] = useState<JobLevel[]>([]);
    const [jobLevelsPage, setJobLevelsPage] = useState(1);
    const [jobLevelsTotalPages, setJobLevelsTotalPages] = useState(1);
    const [jobLevelsSearch, setJobLevelsSearch] = useState('');
    const [jobLevelsVisibility, setJobLevelsVisibility] = useState('');

    const [divisionsData, setDivisionsData] = useState<Division[]>([]);
    const [divisionsPage, setDivisionsPage] = useState(1);
    const [divisionsTotalPages, setDivisionsTotalPages] = useState(1);
    const [divisionsSearch, setDivisionsSearch] = useState('');
    const [divisionsVisibility, setDivisionsVisibility] = useState('');

    const [userLocationsData, setUserLocationsData] = useState<UserLocationAssignment[]>([]);
    const [userLocationsPage, setUserLocationsPage] = useState(1);
    const [userLocationsTotalPages, setUserLocationsTotalPages] = useState(1);
    const [userLocationsSearch, setUserLocationsSearch] = useState('');

    const [locationsData, setLocationsData] = useState<Location[]>([]);
    const [locationsPage, setLocationsPage] = useState(1);
    const [locationsTotalPages, setLocationsTotalPages] = useState(1);

    const [regionalsData, setRegionalsData] = useState<Regional[]>([]);
    const [regionalsPage, setRegionalsPage] = useState(1);
    const [regionalsTotalPages, setRegionalsTotalPages] = useState(1);

    const [storeFilter, setStoreFilter] = useState('');
    const [locationsSearch, setLocationsSearch] = useState('');
    const [regionalsSearch, setRegionalsSearch] = useState('');
    const [guidesSearch, setGuidesSearch] = useState('');
    const [workStationSection, setWorkStationSection] = useState<'guides' | 'catalog'>('guides');
    const [taskCatalog, setTaskCatalog] = useState<WorkStation[]>([]);
    const [taskCategorySearch, setTaskCategorySearch] = useState('');
    const [taskAreaSearch, setTaskAreaSearch] = useState('');
    const [taskDefinitionSearch, setTaskDefinitionSearch] = useState('');
    const [selectedCatalogStationId, setSelectedCatalogStationId] = useState('');
    const [selectedTaskAreaId, setSelectedTaskAreaId] = useState('');
    const [taskAreaForm, setTaskAreaForm] = useState({ id: '', name: '', sort_order: '0', active: true });
    const [taskDefinitionForm, setTaskDefinitionForm] = useState({ id: '', title: '', sort_order: '0', active: true });
    const [isTaskAreaFormOpen, setIsTaskAreaFormOpen] = useState(false);
    const [isTaskDefinitionFormOpen, setIsTaskDefinitionFormOpen] = useState(false);
    const [hierarchySearch, setHierarchySearch] = useState('');

    const [leadersData, setLeadersData] = useState<ReportingUserOption[]>([]);
    const [reportingUsersData, setReportingUsersData] = useState<ReportingUserOption[]>([]);
    const [selectedLeaderId, setSelectedLeaderId] = useState('');
    const [reportingLinesData, setReportingLinesData] = useState<ReportingLine[]>([]);

    const [onlineUsersData, setOnlineUsersData] = useState<UserActivityRow[]>([]);
    const [onlineUsersPage, setOnlineUsersPage] = useState(1);
    const [onlineUsersTotalPages, setOnlineUsersTotalPages] = useState(1);
    const [onlineUsersSearch, setOnlineUsersSearch] = useState('');
    const [onlineUsersStoreFilter, setOnlineUsersStoreFilter] = useState('');

    const [recentLoginsData, setRecentLoginsData] = useState<UserActivityRow[]>([]);
    const [recentLoginsPage, setRecentLoginsPage] = useState(1);
    const [recentLoginsTotalPages, setRecentLoginsTotalPages] = useState(1);
    const [recentLoginsTotal, setRecentLoginsTotal] = useState(0);
    const [recentLoginsSearch, setRecentLoginsSearch] = useState('');
    const [recentLoginsStoreFilter, setRecentLoginsStoreFilter] = useState('');

    const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
    const [userForm, setUserForm] = useState(emptyUserForm);
    const [lineForm, setLineForm] = useState({ leader_id: '', subordinate_ids: [] as string[], status: 'active' as 'active' | 'inactive' });
    const [guideForm, setGuideForm] = useState({ id: '', name: '', guideText: '', active: true });
    const [evaluationForm, setEvaluationForm] = useState(emptyEvaluationForm);
    const [scoringForm, setScoringForm] = useState(emptyScoringForm);
    const [newScoringStatus, setNewScoringStatus] = useState('');
    const [selectedLocationInitial, setSelectedLocationInitial] = useState<string | null>(null);
    const [locationForm, setLocationForm] = useState({
        initial: '',
        name: '',
        store_code: '',
        address: '',
        city: '',
        phone: '',
        region_code: '',
        type_store: '',
        is_active: true,
    });
    const [selectedRegionalId, setSelectedRegionalId] = useState<number | null>(null);
    const [regionalForm, setRegionalForm] = useState({ kode_regional: '', nama_regional: '', cabang: '' });
    const [roleForm, setRoleForm] = useState(emptyRoleForm);
    const [appRoleForm, setAppRoleForm] = useState(emptyAppRoleForm);

    const [isUserFormOpen, setIsUserFormOpen] = useState(false);
    const [isRoleFormOpen, setIsRoleFormOpen] = useState(false);
    const [isAppRoleFormOpen, setIsAppRoleFormOpen] = useState(false);
    const [isGuideFormOpen, setIsGuideFormOpen] = useState(false);
    const [isEvaluationFormOpen, setIsEvaluationFormOpen] = useState(false);
    const [isLocationFormOpen, setIsLocationFormOpen] = useState(false);
    const [isRegionalFormOpen, setIsRegionalFormOpen] = useState(false);
    const [isReportingImportOpen, setIsReportingImportOpen] = useState(false);
    const [reportingImportFile, setReportingImportFile] = useState<File | null>(null);
    const [reportingImportPreview, setReportingImportPreview] = useState<ReportingImportPreview | null>(null);
    const [reportingImportBusy, setReportingImportBusy] = useState(false);
    const [reportingImportError, setReportingImportError] = useState('');
    const currentPermissionsKey = data?.current_permissions.join('|') || '';
    const isAdminAccount = data?.current_account_role?.toLowerCase() === 'admin';
    const canAccessPermission = (permission: string) => Boolean(isAdminAccount || data?.current_permissions.includes(permission));

    useEffect(() => {
        fetchOverview();
    }, []);

    useEffect(() => {
        localStorage.setItem('yodaily_cms_sidebar_expanded', String(sidebarExpanded));
    }, [sidebarExpanded]);

    useEffect(() => {
        if (!data) return;
        if (canAccessPermission(TAB_PERMISSIONS[activeTab])) return;

        const nextTab = TAB_ORDER.find((tab) => canAccessPermission(TAB_PERMISSIONS[tab]));
        if (nextTab) setActiveTab(nextTab);
    }, [activeTab, data?.current_account_role, currentPermissionsKey]);

    useEffect(() => {
        if (!data) return;
        if (!canAccessPermission(TAB_PERMISSIONS[activeTab])) return;

        if (activeTab === 'users') fetchUsers();
        else if (activeTab === 'jobLevels') fetchJobLevels();
        else if (activeTab === 'divisions') fetchDivisions();
        else if (activeTab === 'appRoles') {
            fetchUserLocations();
        }
        else if (activeTab === 'hierarchy') {
            fetchReportingUsers();
            fetchLeaders();
            fetchReportingLines();
        }
        else if (activeTab === 'locations') fetchLocations();
        else if (activeTab === 'regionals') fetchRegionals();
        else if (activeTab === 'guides' && workStationSection === 'catalog') fetchTaskCatalog();
        else if (activeTab === 'activity') {
            fetchOnlineUsers();
            fetchRecentLogins();
        }
    }, [activeTab, workStationSection, usersPage, usersSearch, jobLevelsPage, jobLevelsSearch, jobLevelsVisibility, divisionsPage, divisionsSearch, divisionsVisibility, userLocationsPage, userLocationsSearch, locationsPage, locationsSearch, regionalsPage, regionalsSearch, selectedLeaderId, storeFilter, onlineUsersPage, onlineUsersSearch, onlineUsersStoreFilter, recentLoginsPage, recentLoginsSearch, recentLoginsStoreFilter, data?.stats, data?.current_account_role, currentPermissionsKey]);

    const fetchOverview = async () => {
        setLoading(true);
        setMessage('');
        try {
            const payload = await requestJson('/api/cms/overview', 'GET');
            setData(payload);
            setScoringForm({
                ...scoringFormFromRule(payload.scoring_rules?.[0]),
                effective_from: nextScoringEffectiveDate(payload.scoring_rules || []),
            });
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat data CMS.');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const query = new URLSearchParams({ page: String(usersPage) });
            if (usersSearch) query.append('search', usersSearch);
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/users?${query.toString()}`, 'GET');
            setUsersData(res.data || []);
            setUsersTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat data user.');
        }
    };

    const fetchJobLevels = async () => {
        try {
            const query = new URLSearchParams({ page: String(jobLevelsPage) });
            if (jobLevelsSearch) query.append('search', jobLevelsSearch);
            if (jobLevelsVisibility) query.append('visibility', jobLevelsVisibility);
            const res = await requestJson(`/api/cms/job-levels?${query.toString()}`, 'GET');
            setJobLevelsData(res.data || []);
            setJobLevelsTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat job level.');
        }
    };

    const fetchDivisions = async () => {
        try {
            const query = new URLSearchParams({ page: String(divisionsPage) });
            if (divisionsSearch) query.append('search', divisionsSearch);
            if (divisionsVisibility) query.append('visibility', divisionsVisibility);
            const res = await requestJson(`/api/cms/divisions?${query.toString()}`, 'GET');
            setDivisionsData(res.data || []);
            setDivisionsTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat divisi.');
        }
    };

    const fetchUserLocations = async () => {
        try {
            const query = new URLSearchParams({ page: String(userLocationsPage) });
            if (userLocationsSearch) query.append('search', userLocationsSearch);
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/user-locations?${query.toString()}`, 'GET');
            setUserLocationsData(res.data || []);
            setUserLocationsTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat lokasi user.');
        }
    };

    const fetchLocations = async () => {
        try {
            const query = new URLSearchParams({ page: String(locationsPage) });
            if (locationsSearch) query.append('search', locationsSearch);
            const res = await requestJson(`/api/cms/locations?${query.toString()}`, 'GET');
            setLocationsData(res.data || []);
            setLocationsTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat lokasi.');
        }
    };

    const fetchRegionals = async () => {
        try {
            const query = new URLSearchParams({ page: String(regionalsPage) });
            if (regionalsSearch) query.append('search', regionalsSearch);
            const res = await requestJson(`/api/cms/regionals?${query.toString()}`, 'GET');
            setRegionalsData(res.data || []);
            setRegionalsTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat regional.');
        }
    };

    const fetchTaskCatalog = async (preferredStationId = '', preferredAreaId = '') => {
        try {
            const catalog = await requestJson('/api/cms/task-catalog', 'GET');
            setTaskCatalog(catalog || []);
            const stationId = preferredStationId
                || (catalog?.some((station: WorkStation) => String(station.id) === selectedCatalogStationId) ? selectedCatalogStationId : '')
                || String(catalog?.[0]?.id || '');
            const station = catalog?.find((item: WorkStation) => String(item.id) === stationId);
            const areaId = preferredAreaId
                || (station?.task_areas?.some((area: TaskArea) => String(area.id) === selectedTaskAreaId) ? selectedTaskAreaId : '')
                || String(station?.task_areas?.[0]?.id || '');
            setSelectedCatalogStationId(stationId);
            setSelectedTaskAreaId(areaId);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat master task.');
        }
    };

    const fetchLeaders = async () => {
        try {
            const query = new URLSearchParams();
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/leaders?${query.toString()}`, 'GET');
            setLeadersData(res || []);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat daftar atasan.');
        }
    };

    const fetchReportingUsers = async () => {
        try {
            const query = new URLSearchParams();
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/reporting-users?${query.toString()}`, 'GET');
            setReportingUsersData(res || []);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat kandidat bawahan.');
        }
    };

    const fetchReportingLines = async () => {
        try {
            const query = new URLSearchParams();
            if (selectedLeaderId) query.append('leader_id', selectedLeaderId);
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/reporting-lines?${query.toString()}`, 'GET');
            setReportingLinesData(res || []);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat relasi atasan.');
        }
    };

    const fetchOnlineUsers = async () => {
        try {
            const query = new URLSearchParams({ page: String(onlineUsersPage) });
            if (onlineUsersSearch) query.append('search', onlineUsersSearch);
            if (onlineUsersStoreFilter) query.append('store', onlineUsersStoreFilter);
            const res = await requestJson(`/api/cms/user-activity/online?${query.toString()}`, 'GET');
            setOnlineUsersData(res.data || []);
            setOnlineUsersTotalPages(res.last_page || 1);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat user yang sedang aktif.');
        }
    };

    const fetchRecentLogins = async () => {
        try {
            const query = new URLSearchParams({ page: String(recentLoginsPage), days: '7' });
            if (recentLoginsSearch) query.append('search', recentLoginsSearch);
            if (recentLoginsStoreFilter) query.append('store', recentLoginsStoreFilter);
            const res = await requestJson(`/api/cms/user-activity/recent-logins?${query.toString()}`, 'GET');
            setRecentLoginsData(res.data || []);
            setRecentLoginsTotalPages(res.last_page || 1);
            setRecentLoginsTotal(res.total || 0);
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat login 7 hari terakhir.');
        }
    };

    const selectReportingLeader = async (leaderId: string) => {
        setSelectedLeaderId(leaderId);

        if (!leaderId) {
            setLineForm((current) => ({ ...current, leader_id: '', subordinate_ids: [] }));
            setReportingLinesData([]);
            return;
        }

        try {
            const query = new URLSearchParams({ leader_id: leaderId });
            if (storeFilter) query.append('store', storeFilter);
            const lines = await requestJson(`/api/cms/reporting-lines?${query.toString()}`, 'GET');
            const activeSubordinates = (lines || [])
                .filter((line: ReportingLine) => line.status === 'active')
                .map((line: ReportingLine) => line.subordinate_id)
                .filter((subordinateId: string) => subordinateId !== leaderId);

            setReportingLinesData(lines || []);
            setLineForm((current) => ({
                ...current,
                leader_id: leaderId,
                subordinate_ids: activeSubordinates,
            }));
        } catch (error: any) {
            setMessage(error.message || 'Gagal memuat bawahan yang sudah terhubung.');
            setLineForm((current) => ({ ...current, leader_id: leaderId, subordinate_ids: [] }));
        }
    };

    const requestJson = async (url: string, method: string, body?: any) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            let errorMessage = payload?.message || 'Request failed.';
            if (payload?.errors && typeof payload.errors === 'object') {
                const firstErrorKey = Object.keys(payload.errors)[0];
                if (firstErrorKey && Array.isArray(payload.errors[firstErrorKey])) {
                    errorMessage = payload.errors[firstErrorKey][0];
                }
            }
            throw new Error(errorMessage);
        }

        return response.json().catch(() => null);
    };

    const requestFormData = async (url: string, body: FormData) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
            body,
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const firstErrors = payload?.errors && typeof payload.errors === 'object'
                ? Object.values(payload.errors).find(Array.isArray) as string[] | undefined
                : undefined;
            throw new Error(firstErrors?.[0] || payload?.message || 'Gagal memproses spreadsheet.');
        }

        return response.json();
    };

    const selectUser = (user: CmsUser) => {
        setSelectedUsername(user.username);
        setUserForm({
            username: user.username,
            name: user.name,
            email: user.email || '',
            password: '',
            initial_store: user.initial_store || '',
            role_id: user.role_id ? String(user.role_id) : '',
            job_level_id: user.job_level_id ? String(user.job_level_id) : '',
            division_id: user.division_id ? String(user.division_id) : '',
            active: user.active,
            is_back_office: user.is_back_office,
            location_ids: user.locations.map((location) => location.initial),
        });
        setIsUserFormOpen(true);
    };

    const resetUserForm = () => {
        setSelectedUsername(null);
        setUserForm(emptyUserForm);
        setIsUserFormOpen(true);
    };

    const closeUserForm = () => {
        setSelectedUsername(null);
        setUserForm(emptyUserForm);
        setIsUserFormOpen(false);
    };

    const toggleLocation = (initial: string) => {
        setUserForm((current) => ({
            ...current,
            location_ids: current.location_ids.includes(initial)
                ? current.location_ids.filter((item) => item !== initial)
                : [...current.location_ids, initial],
        }));
    };

    const saveUser = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                ...userForm,
                role_id: userForm.role_id ? Number(userForm.role_id) : null,
                job_level_id: userForm.job_level_id ? Number(userForm.job_level_id) : null,
                division_id: userForm.division_id ? Number(userForm.division_id) : null,
                password: userForm.password || undefined,
            };

            if (selectedUsername) {
                await requestJson(`/api/cms/users/${selectedUsername}`, 'PATCH', payload);
                setMessage('User updated.');
            } else {
                await requestJson('/api/cms/users', 'POST', payload);
                setMessage('User created.');
            }

            closeUserForm();
            await fetchUsers();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan user.');
        } finally {
            setSaving(false);
        }
    };

    const saveReportingLine = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            if (!lineForm.leader_id || lineForm.subordinate_ids.length === 0) {
                throw new Error('Please choose a leader and at least one subordinate.');
            }
            await Promise.all(lineForm.subordinate_ids.map((subordinateId) => requestJson('/api/cms/reporting-lines', 'POST', {
                leader_id: lineForm.leader_id,
                subordinate_id: subordinateId,
                status: lineForm.status,
            })));
            setLineForm({ leader_id: '', subordinate_ids: [], status: 'active' });
            setMessage(`${lineForm.subordinate_ids.length} reporting line(s) saved.`);
            await fetchReportingLines();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan relasi atasan.');
        } finally {
            setSaving(false);
        }
    };

    const closeReportingImport = () => {
        if (reportingImportBusy) return;
        setIsReportingImportOpen(false);
        setReportingImportFile(null);
        setReportingImportPreview(null);
        setReportingImportError('');
    };

    const downloadReportingTemplate = async () => {
        setReportingImportError('');
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/cms/reporting-lines/import-template', {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.message || 'Gagal mengunduh template.');
            }

            const blobUrl = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = 'template-import-relasi-atasan.xlsx';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (error: any) {
            setReportingImportError(error.message || 'Gagal mengunduh template.');
        }
    };

    const previewReportingImport = async () => {
        if (!reportingImportFile) {
            setReportingImportError('Pilih file XLSX terlebih dahulu.');
            return;
        }

        setReportingImportBusy(true);
        setReportingImportError('');
        try {
            const formData = new FormData();
            formData.append('file', reportingImportFile);
            setReportingImportPreview(await requestFormData('/api/cms/reporting-lines/import-preview', formData));
        } catch (error: any) {
            setReportingImportError(error.message || 'Gagal memeriksa spreadsheet.');
            setReportingImportPreview(null);
        } finally {
            setReportingImportBusy(false);
        }
    };

    const commitReportingImport = async () => {
        if (!reportingImportFile || !reportingImportPreview) return;

        setReportingImportBusy(true);
        setReportingImportError('');
        try {
            const formData = new FormData();
            formData.append('file', reportingImportFile);
            const result = await requestFormData('/api/cms/reporting-lines/import', formData);
            setMessage(result.message || 'Import relasi selesai.');
            setIsReportingImportOpen(false);
            setReportingImportFile(null);
            setReportingImportPreview(null);
            await fetchReportingLines();
            await fetchOverview();
        } catch (error: any) {
            setReportingImportError(error.message || 'Gagal mengimport relasi.');
        } finally {
            setReportingImportBusy(false);
        }
    };

    const deleteReportingLine = async (id: number) => {
        if (!window.confirm('Remove this reporting line?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/reporting-lines/${id}`, 'DELETE');
            setMessage('Reporting line deleted.');
            await fetchReportingLines();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus relasi atasan.');
        } finally {
            setSaving(false);
        }
    };

    const toggleReportingLineStatus = async (line: ReportingLine) => {
        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/reporting-lines/${line.id}`, 'PATCH', {
                leader_id: line.leader_id,
                subordinate_id: line.subordinate_id,
                status: line.status === 'active' ? 'inactive' : 'active',
            });
            setMessage(`Reporting line ${line.status === 'active' ? 'deactivated' : 'activated'}.`);
            await fetchReportingLines();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal memperbarui relasi atasan.');
        } finally {
            setSaving(false);
        }
    };

    const selectGuide = (station: WorkStation) => {
        setGuideForm({
            id: String(station.id),
            name: station.name,
            guideText: station.guide_content.join('\n'),
            active: station.active,
        });
        setIsGuideFormOpen(true);
    };

    const closeGuideForm = () => {
        setGuideForm({ id: '', name: '', guideText: '', active: true });
        setIsGuideFormOpen(false);
    };

    const saveGuide = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                name: guideForm.name,
                guide_content: guideForm.guideText
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                active: guideForm.active,
            };

            if (guideForm.id) {
                await requestJson(`/api/cms/work-stations/${guideForm.id}`, 'PATCH', payload);
                setMessage('Work station berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/work-stations', 'POST', payload);
                setMessage('Work station berhasil dibuat.');
            }

            closeGuideForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan work station.');
        } finally {
            setSaving(false);
        }
    };

    const deleteWorkStation = async (id: string) => {
        if (!id || !window.confirm('Hapus work station ini? Work station yang memiliki riwayat tidak dapat dihapus.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/work-stations/${id}`, 'DELETE');
            setMessage('Work station berhasil dihapus.');
            closeGuideForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus work station.');
        } finally {
            setSaving(false);
        }
    };

    const selectCatalogStation = (station: WorkStation) => {
        setSelectedCatalogStationId(String(station.id));
        setSelectedTaskAreaId(String(station.task_areas?.[0]?.id || ''));
        setTaskAreaSearch('');
        setTaskDefinitionSearch('');
        setTaskAreaForm({ id: '', name: '', sort_order: '0', active: true });
        setTaskDefinitionForm({ id: '', title: '', sort_order: '0', active: true });
        setIsTaskAreaFormOpen(false);
        setIsTaskDefinitionFormOpen(false);
    };

    const openNewTaskAreaForm = () => {
        const station = taskCatalog.find((item) => String(item.id) === selectedCatalogStationId);
        const nextSortOrder = Math.min(65535, Math.max(0, ...(station?.task_areas || []).map((area) => area.sort_order)) + 10);
        setTaskAreaForm({ id: '', name: '', sort_order: String(nextSortOrder), active: true });
        setIsTaskAreaFormOpen(true);
        setTaskDefinitionForm({ id: '', title: '', sort_order: '0', active: true });
        setIsTaskDefinitionFormOpen(false);
    };

    const selectTaskArea = (area: TaskArea) => {
        setSelectedTaskAreaId(String(area.id));
        setTaskAreaForm({
            id: String(area.id),
            name: area.name,
            sort_order: String(area.sort_order),
            active: area.active,
        });
        setIsTaskAreaFormOpen(true);
        setTaskDefinitionSearch('');
        setTaskDefinitionForm({ id: '', title: '', sort_order: '0', active: true });
        setIsTaskDefinitionFormOpen(false);
    };

    const closeTaskAreaForm = () => {
        setTaskAreaForm({ id: '', name: '', sort_order: '0', active: true });
        setIsTaskAreaFormOpen(false);
    };

    const saveTaskArea = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedCatalogStationId) return;

        setSaving(true);
        setMessage('');
        try {
            const payload = {
                name: taskAreaForm.name,
                sort_order: Number(taskAreaForm.sort_order),
                active: taskAreaForm.active,
            };
            const area = taskAreaForm.id
                ? await requestJson(`/api/cms/task-areas/${taskAreaForm.id}`, 'PATCH', payload)
                : await requestJson(`/api/cms/work-stations/${selectedCatalogStationId}/task-areas`, 'POST', payload);
            setMessage(taskAreaForm.id ? 'Area berhasil diperbarui.' : 'Area berhasil dibuat.');
            closeTaskAreaForm();
            await fetchTaskCatalog(selectedCatalogStationId, String(area.id));
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan area.');
        } finally {
            setSaving(false);
        }
    };

    const deleteTaskArea = async (area: TaskArea) => {
        if (!window.confirm(`Hapus area "${area.name}"?`)) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/task-areas/${area.id}`, 'DELETE');
            setTaskAreaForm({ id: '', name: '', sort_order: '0', active: true });
            setTaskDefinitionForm({ id: '', title: '', sort_order: '0', active: true });
            setSelectedTaskAreaId('');
            setIsTaskAreaFormOpen(false);
            setIsTaskDefinitionFormOpen(false);
            setMessage('Area berhasil dihapus.');
            await fetchTaskCatalog(selectedCatalogStationId);
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus area.');
        } finally {
            setSaving(false);
        }
    };

    const selectTaskDefinition = (definition: TaskDefinition) => {
        setTaskDefinitionForm({
            id: String(definition.id),
            title: definition.title,
            sort_order: String(definition.sort_order),
            active: definition.active,
        });
        setIsTaskDefinitionFormOpen(true);
    };

    const openNewTaskDefinitionForm = () => {
        const station = taskCatalog.find((item) => String(item.id) === selectedCatalogStationId);
        const area = station?.task_areas?.find((item) => String(item.id) === selectedTaskAreaId);
        const nextSortOrder = Math.min(65535, Math.max(0, ...(area?.task_definitions || []).map((definition) => definition.sort_order)) + 10);
        setTaskDefinitionForm({ id: '', title: '', sort_order: String(nextSortOrder), active: true });
        setIsTaskDefinitionFormOpen(true);
    };

    const closeTaskDefinitionForm = () => {
        setTaskDefinitionForm({ id: '', title: '', sort_order: '0', active: true });
        setIsTaskDefinitionFormOpen(false);
    };

    const saveTaskDefinition = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedTaskAreaId) return;

        setSaving(true);
        setMessage('');
        try {
            const payload = {
                title: taskDefinitionForm.title,
                sort_order: Number(taskDefinitionForm.sort_order),
                active: taskDefinitionForm.active,
            };
            await requestJson(
                taskDefinitionForm.id
                    ? `/api/cms/task-definitions/${taskDefinitionForm.id}`
                    : `/api/cms/task-areas/${selectedTaskAreaId}/task-definitions`,
                taskDefinitionForm.id ? 'PATCH' : 'POST',
                payload,
            );
            setMessage(taskDefinitionForm.id ? 'Master task berhasil diperbarui.' : 'Master task berhasil dibuat.');
            closeTaskDefinitionForm();
            await fetchTaskCatalog(selectedCatalogStationId, selectedTaskAreaId);
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan master task.');
        } finally {
            setSaving(false);
        }
    };

    const deleteTaskDefinition = async (definition: TaskDefinition) => {
        if (!window.confirm(`Hapus master task "${definition.title}"?`)) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/task-definitions/${definition.id}`, 'DELETE');
            closeTaskDefinitionForm();
            setMessage('Master task berhasil dihapus.');
            await fetchTaskCatalog(selectedCatalogStationId, selectedTaskAreaId);
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus master task.');
        } finally {
            setSaving(false);
        }
    };

    const selectLocation = (location: Location) => {
        setSelectedLocationInitial(location.initial);
        setLocationForm({
            initial: location.initial,
            name: location.name || '',
            store_code: location.store_code ? String(location.store_code) : '',
            address: location.address || '',
            city: location.city || '',
            phone: location.phone || '',
            region_code: location.region_code ? String(location.region_code) : '',
            type_store: location.type_store || '',
            is_active: Boolean(location.is_active ?? true),
        });
        setIsLocationFormOpen(true);
    };

    const resetLocationForm = () => {
        setSelectedLocationInitial(null);
        setLocationForm({
            initial: '',
            name: '',
            store_code: '',
            address: '',
            city: '',
            phone: '',
            region_code: '',
            type_store: '',
            is_active: true,
        });
        setIsLocationFormOpen(true);
    };

    const closeLocationForm = () => {
        setSelectedLocationInitial(null);
        setLocationForm({
            initial: '',
            name: '',
            store_code: '',
            address: '',
            city: '',
            phone: '',
            region_code: '',
            type_store: '',
            is_active: true,
        });
        setIsLocationFormOpen(false);
    };

    const saveLocation = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                ...locationForm,
                store_code: locationForm.store_code ? Number(locationForm.store_code) : null,
                region_code: locationForm.region_code ? Number(locationForm.region_code) : null,
            };

            if (selectedLocationInitial) {
                await requestJson(`/api/cms/locations/${selectedLocationInitial}`, 'PATCH', payload);
                setMessage('Lokasi berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/locations', 'POST', payload);
                setMessage('Lokasi berhasil dibuat.');
            }

            closeLocationForm();
            await fetchLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan lokasi.');
        } finally {
            setSaving(false);
        }
    };

    const deleteLocation = async (initial: string) => {
        if (!window.confirm('Hapus lokasi ini? Lokasi yang sudah terhubung ke user tidak dapat dihapus.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/locations/${initial}`, 'DELETE');
            setMessage('Lokasi berhasil dihapus.');
            closeLocationForm();
            await fetchLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus lokasi.');
        } finally {
            setSaving(false);
        }
    };

    const updateUserLocationRole = async (assignment: UserLocationAssignment, jobLevel: string) => {
        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/user-locations/${assignment.id}`, 'PATCH', { job_level: jobLevel });
            setMessage('Role aplikasi berhasil diperbarui.');
            await fetchUserLocations();
        } catch (error: any) {
            setMessage(error.message || 'Gagal memperbarui role aplikasi.');
        } finally {
            setSaving(false);
        }
    };

    const syncUserLocations = async () => {
        setSaving(true);
        setMessage('');
        try {
            const payload = await requestJson('/api/cms/user-locations/sync', 'POST');
            setMessage(payload?.message || 'Data lokasi user berhasil disinkronkan.');
            await fetchUserLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyinkronkan lokasi user.');
        } finally {
            setSaving(false);
        }
    };

    const toggleJobLevelVisibility = async (jobLevel: JobLevel) => {
        setSaving(true);
        setMessage('');
        try {
            const nextVisible = !jobLevel.visible_in_yodaily;
            await requestJson(`/api/cms/job-levels/${jobLevel.id}`, 'PATCH', {
                visible_in_yodaily: nextVisible,
            });
            setMessage(`${jobLevel.name} berhasil ${nextVisible ? 'ditampilkan di' : 'disembunyikan dari'} YoDaily.`);
            await fetchJobLevels();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal memperbarui job level.');
        } finally {
            setSaving(false);
        }
    };

    const toggleDivisionVisibility = async (division: Division) => {
        setSaving(true);
        setMessage('');
        try {
            const nextVisible = !division.visible_in_yodaily;
            await requestJson(`/api/cms/divisions/${division.id}`, 'PATCH', {
                visible_in_yodaily: nextVisible,
            });
            setMessage(`${division.name} berhasil ${nextVisible ? 'ditampilkan di' : 'disembunyikan dari'} YoDaily.`);
            await fetchDivisions();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal memperbarui divisi.');
        } finally {
            setSaving(false);
        }
    };

    const selectEvaluation = (item: EvaluationMaster) => {
        setEvaluationForm({
            id: String(item.id),
            title: item.title,
            subtitle: item.subtitle,
            question: item.question,
            answers: item.answers.length ? [...item.answers] : [''],
            sort_order: String(item.sort_order || ''),
            active: item.active,
        });
        setIsEvaluationFormOpen(true);
    };

    const resetEvaluationForm = () => {
        setEvaluationForm({
            ...emptyEvaluationForm,
            sort_order: String((data?.evaluation_masters.length || 0) + 1),
        });
        setIsEvaluationFormOpen(true);
    };

    const closeEvaluationForm = () => {
        setEvaluationForm(emptyEvaluationForm);
        setIsEvaluationFormOpen(false);
    };

    const saveEvaluationMaster = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                title: evaluationForm.title,
                subtitle: evaluationForm.subtitle,
                question: evaluationForm.question,
                answers: evaluationForm.answers.map((answer) => answer.trim()).filter(Boolean),
                sort_order: evaluationForm.sort_order ? Number(evaluationForm.sort_order) : 0,
                active: evaluationForm.active,
            };

            if (evaluationForm.id) {
                await requestJson(`/api/cms/evaluation-masters/${evaluationForm.id}`, 'PATCH', payload);
                setMessage('Master evaluasi berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/evaluation-masters', 'POST', payload);
                setMessage('Master evaluasi berhasil dibuat.');
            }

            closeEvaluationForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan master evaluasi.');
        } finally {
            setSaving(false);
        }
    };

    const deleteEvaluationMaster = async (id: string) => {
        if (!id || !window.confirm('Hapus item evaluasi ini?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/evaluation-masters/${id}`, 'DELETE');
            setMessage('Item evaluasi berhasil dihapus.');
            closeEvaluationForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus item evaluasi.');
        } finally {
            setSaving(false);
        }
    };

    const toggleScoringStatus = (field: 'attendance_included_statuses' | 'task_excluded_statuses', status: string) => {
        setScoringForm((current) => ({
            ...current,
            [field]: current[field].includes(status)
                ? current[field].filter((item) => item !== status)
                : [...current[field], status],
        }));
    };

    const saveScoringRule = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await requestJson('/api/cms/scoring-rules', 'POST', {
                effective_from: scoringForm.effective_from,
                task_weight: Number(scoringForm.task_weight),
                attendance_weight: Number(scoringForm.attendance_weight),
                evaluation_weight: Number(scoringForm.evaluation_weight),
                attendance_target: Number(scoringForm.attendance_target),
                attendance_included_statuses: scoringForm.attendance_included_statuses,
                task_excluded_statuses: scoringForm.task_excluded_statuses,
                cashier_task_weight: Number(scoringForm.cashier_task_weight),
                cashier_ibop_weight: Number(scoringForm.cashier_ibop_weight),
                cashier_push_selling_weight: Number(scoringForm.cashier_push_selling_weight),
            });
            setMessage('Versi aturan penilaian berhasil disimpan.');
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan master penilaian.');
        } finally {
            setSaving(false);
        }
    };

    const selectRole = (role: AccountRole) => {
        setRoleForm({
            id: String(role.id),
            name: role.name,
            description: role.description || '',
            permissions: role.permissions || [],
        });
        setIsRoleFormOpen(true);
    };

    const resetRoleForm = () => {
        setRoleForm(emptyRoleForm);
        setIsRoleFormOpen(true);
    };

    const closeRoleForm = () => {
        setRoleForm(emptyRoleForm);
        setIsRoleFormOpen(false);
    };

    const toggleRolePermission = (permission: string) => {
        setRoleForm((current) => ({
            ...current,
            permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
        }));
    };

    const saveRole = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                name: roleForm.name,
                description: roleForm.description,
                permissions: roleForm.permissions,
            };

            if (roleForm.id) {
                await requestJson(`/api/cms/roles/${roleForm.id}`, 'PATCH', payload);
                setMessage('Role akun berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/roles', 'POST', payload);
                setMessage('Role akun berhasil dibuat.');
            }

            closeRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan role akun.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRole = async (id: string) => {
        if (!id || !window.confirm('Hapus role akun ini?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/roles/${id}`, 'DELETE');
            setMessage('Role akun berhasil dihapus.');
            closeRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus role akun.');
        } finally {
            setSaving(false);
        }
    };

    const selectAppRole = (role: AppRole) => {
        setAppRoleForm({
            id: String(role.id),
            name: role.name,
            description: role.description || '',
            active: role.active,
        });
        setIsAppRoleFormOpen(true);
    };

    const resetAppRoleForm = () => {
        setAppRoleForm(emptyAppRoleForm);
        setIsAppRoleFormOpen(true);
    };

    const closeAppRoleForm = () => {
        setAppRoleForm(emptyAppRoleForm);
        setIsAppRoleFormOpen(false);
    };

    const saveAppRole = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const payload = {
                name: appRoleForm.name,
                description: appRoleForm.description,
                active: appRoleForm.active,
            };

            if (appRoleForm.id) {
                await requestJson(`/api/cms/app-roles/${appRoleForm.id}`, 'PATCH', payload);
                setMessage('Role aplikasi berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/app-roles', 'POST', payload);
                setMessage('Role aplikasi berhasil dibuat.');
            }

            closeAppRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan role aplikasi.');
        } finally {
            setSaving(false);
        }
    };

    const deleteAppRole = async (id: string) => {
        if (!id || !window.confirm('Hapus role aplikasi ini? Role yang sudah dipakai tidak dapat dihapus.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/app-roles/${id}`, 'DELETE');
            setMessage('Role aplikasi berhasil dihapus.');
            closeAppRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus role aplikasi.');
        } finally {
            setSaving(false);
        }
    };

    const selectRegional = (regional: Regional) => {
        setSelectedRegionalId(regional.id);
        setRegionalForm({
            kode_regional: regional.kode_regional,
            nama_regional: regional.nama_regional,
            cabang: regional.cabang || '',
        });
        setIsRegionalFormOpen(true);
    };

    const resetRegionalForm = () => {
        setSelectedRegionalId(null);
        setRegionalForm({ kode_regional: '', nama_regional: '', cabang: '' });
        setIsRegionalFormOpen(true);
    };

    const closeRegionalForm = () => {
        setSelectedRegionalId(null);
        setRegionalForm({ kode_regional: '', nama_regional: '', cabang: '' });
        setIsRegionalFormOpen(false);
    };

    const saveRegional = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            if (selectedRegionalId) {
                await requestJson(`/api/cms/regionals/${selectedRegionalId}`, 'PATCH', regionalForm);
                setMessage('Regional berhasil diperbarui.');
            } else {
                await requestJson('/api/cms/regionals', 'POST', regionalForm);
                setMessage('Regional berhasil dibuat.');
            }

            closeRegionalForm();
            await fetchRegionals();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menyimpan regional.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRegional = async (id: number) => {
        if (!window.confirm('Hapus regional ini?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/regionals/${id}`, 'DELETE');
            setMessage('Regional berhasil dihapus.');
            closeRegionalForm();
            await fetchRegionals();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Gagal menghapus regional.');
        } finally {
            setSaving(false);
        }
    };

    const normalizedCategorySearch = taskCategorySearch.trim().toLowerCase();
    const normalizedAreaSearch = taskAreaSearch.trim().toLowerCase();
    const normalizedTaskSearch = taskDefinitionSearch.trim().toLowerCase();
    const selectedCatalogStation = taskCatalog.find((station) => String(station.id) === selectedCatalogStationId);
    const selectedTaskArea = selectedCatalogStation?.task_areas?.find((area) => String(area.id) === selectedTaskAreaId);
    const filteredCatalogStations = taskCatalog.filter((station) => !normalizedCategorySearch
        || station.name.toLowerCase().includes(normalizedCategorySearch));
    const filteredTaskAreas = (selectedCatalogStation?.task_areas || []).filter((area) => !normalizedAreaSearch
        || area.name.toLowerCase().includes(normalizedAreaSearch));
    const filteredTaskDefinitions = (selectedTaskArea?.task_definitions || []).filter((definition) => !normalizedTaskSearch
        || definition.title.toLowerCase().includes(normalizedTaskSearch));

    if (loading) {
        return <div className="h-full flex items-center justify-center text-gray-400">Memuat CMS...</div>;
    }

    if (!data) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500">
                <p>{message || 'Gagal memuat data CMS.'}</p>
                <button onClick={fetchOverview} className="px-4 py-2 bg-primary text-white rounded-xl">Coba Lagi</button>
            </div>
        );
    }

    const isAdminRole = isAdminAccount;
    const canAccess = (permission: string) => isAdminRole || data.current_permissions.includes(permission);

    const statCards = [
        canAccess('users_locations') ? ['User', data.stats.users] : null,
        canAccess('users_locations') ? ['Aktif', data.stats.active_users] : null,
        canAccess('reporting_lines') ? ['Reporting Line', data.stats.reporting_lines] : null,
        canAccess('app_roles') ? ['Role Aplikasi', data.stats.app_roles] : null,
        canAccess('locations') ? ['Lokasi', data.stats.locations] : null,
        canAccess('regionals') ? ['Regional', data.stats.regionals] : null,
    ].filter((item): item is [string, number] => Boolean(item));

    const reportingImportRows = reportingImportPreview ? [
        ...reportingImportPreview.valid_rows.map((row) => ({ ...row, importStatus: 'valid' as const, reason: 'Relasi siap diimport.' })),
        ...reportingImportPreview.duplicate_rows.map((row) => ({ ...row, importStatus: 'duplicate' as const })),
        ...reportingImportPreview.invalid_rows.map((row) => ({ ...row, importStatus: 'invalid' as const })),
    ].sort((first, second) => first.row - second.row) : [];
    const scoringStatuses = Array.from(new Set([
        ...data.attendance_statuses,
        ...scoringForm.attendance_included_statuses,
        ...scoringForm.task_excluded_statuses,
    ])).sort();
    const monthlyWeightTotal = Number(scoringForm.task_weight) + Number(scoringForm.attendance_weight) + Number(scoringForm.evaluation_weight);
    const cashierWeightTotal = Number(scoringForm.cashier_task_weight) + Number(scoringForm.cashier_ibop_weight) + Number(scoringForm.cashier_push_selling_weight);

    return (
        <div className="flex h-full bg-gray-50">
            <aside className={`${sidebarExpanded ? 'w-64' : 'w-20'} z-20 flex h-full shrink-0 flex-col border-r border-gray-200 bg-white py-6 shadow-sm transition-[width] duration-200`}>
                <div className={`mb-6 flex items-center ${sidebarExpanded ? 'justify-between px-4' : 'justify-center'}`}>
                    {sidebarExpanded ? (
                        <>
                            <div className="shrink-0 rounded-xl bg-purple-100 p-3 text-primary" title="YoDaily CMS">
                                <ShieldCheck size={24} />
                            </div>
                            <span className="ml-3 flex-1 text-sm font-black text-gray-800">YoDaily CMS</span>
                            <button
                                type="button"
                                onClick={() => setSidebarExpanded(false)}
                                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary"
                                title="Lipat sidebar"
                                aria-label="Lipat sidebar"
                            >
                                <PanelLeftClose size={20} />
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setSidebarExpanded(true)}
                            className="group rounded-xl bg-purple-100 p-3 text-primary transition-colors hover:bg-purple-200"
                            title="Buka sidebar YoDaily CMS"
                            aria-label="Buka sidebar YoDaily CMS"
                        >
                            <span className="relative block h-6 w-6">
                                <ShieldCheck className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" size={24} />
                                <PanelLeftOpen className="absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" size={24} />
                            </span>
                        </button>
                    )}
                </div>

                <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3">
                    {canAccess('users_locations') && <TabButton expanded={sidebarExpanded} active={activeTab === 'users'} icon={<UsersRound size={19} />} label="User & Lokasi" onClick={() => setActiveTab('users')} />}
                    {canAccess('job_levels') && <TabButton expanded={sidebarExpanded} active={activeTab === 'jobLevels'} icon={<ShieldCheck size={19} />} label="Job Level HR" onClick={() => setActiveTab('jobLevels')} />}
                    {canAccess('divisions') && <TabButton expanded={sidebarExpanded} active={activeTab === 'divisions'} icon={<Layers3 size={19} />} label="Master Divisi" onClick={() => setActiveTab('divisions')} />}
                    {canAccess('app_roles') && <TabButton expanded={sidebarExpanded} active={activeTab === 'appRoles'} icon={<UserCog size={19} />} label="Role Aplikasi" onClick={() => setActiveTab('appRoles')} />}
                    {canAccess('reporting_lines') && <TabButton expanded={sidebarExpanded} active={activeTab === 'hierarchy'} icon={<GitBranch size={19} />} label="Relasi Atasan" onClick={() => setActiveTab('hierarchy')} />}
                    {canAccess('work_stations') && <TabButton expanded={sidebarExpanded} active={activeTab === 'guides'} icon={<BookOpenCheck size={19} />} label="Master Work Station" onClick={() => setActiveTab('guides')} />}
                    {canAccess('locations') && <TabButton expanded={sidebarExpanded} active={activeTab === 'locations'} icon={<MapPinned size={19} />} label="Master Lokasi" onClick={() => setActiveTab('locations')} />}
                    {canAccess('regionals') && <TabButton expanded={sidebarExpanded} active={activeTab === 'regionals'} icon={<MapPinned size={19} />} label="Master Regional" onClick={() => setActiveTab('regionals')} />}
                    {canAccess('evaluation_masters') && <TabButton expanded={sidebarExpanded} active={activeTab === 'evaluations'} icon={<ShieldCheck size={19} />} label="Master Evaluasi" onClick={() => setActiveTab('evaluations')} />}
                    {canAccess('scoring_masters') && <TabButton expanded={sidebarExpanded} active={activeTab === 'scoring'} icon={<Calculator size={19} />} label="Master Penilaian" onClick={() => setActiveTab('scoring')} />}
                    {canAccess('user_activity') && <TabButton expanded={sidebarExpanded} active={activeTab === 'activity'} icon={<Activity size={19} />} label="Aktivitas User" onClick={() => setActiveTab('activity')} />}
                </nav>

                <div className="mt-4 px-3">
                    <button
                        type="button"
                        onClick={onLogout}
                        className={`flex w-full items-center rounded-xl p-3 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 ${sidebarExpanded ? 'gap-3' : 'justify-center'}`}
                        title="Keluar"
                    >
                        <LogOut size={22} className="shrink-0" />
                        {sidebarExpanded && <span className="text-sm font-bold">Keluar</span>}
                    </button>
                </div>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-400 font-bold">YoDaily CMS</p>
                    <h1 className="text-3xl font-extrabold text-gray-900 mt-2">Panel Admin</h1>
                    <p className="text-gray-500 mt-2">Kelola user, role, relasi, assignment tempat kerja, work station, lokasi, regional, dan evaluasi.</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                    <ServerClock />
                    <button onClick={fetchOverview} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-semibold hover:bg-gray-50">
                        <RefreshCcw size={16} />
                        Muat Ulang
                    </button>
                </div>
            </header>

            <section className="grid grid-cols-6 gap-4 mb-6">
                {statCards.map(([label, value]) => (
                    <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-xs text-gray-400 font-bold uppercase">{label}</p>
                        <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
                    </div>
                ))}
            </section>

            {message && (
                <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm font-semibold text-primary">
                    <span>{message}</span>
                    <button type="button" onClick={() => setMessage('')} className="rounded-lg p-1 transition hover:bg-purple-100" aria-label="Tutup pemberitahuan">
                        <X size={16} />
                    </button>
                </div>
            )}

            {activeTab === 'activity' && canAccess('user_activity') && (
                <div className="grid h-[clamp(420px,calc(100dvh-24rem),700px)] grid-cols-2 gap-6">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="space-y-4 border-b border-gray-100 px-6 py-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="font-black text-gray-900">Sedang Online</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-600">{data.stats.online_users || 0} online</span>
                                    <button onClick={fetchOnlineUsers} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:border-primary hover:text-primary">
                                        Muat Ulang
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-[260px_1fr] gap-3">
                                <CustomSelect
                                    value={onlineUsersStoreFilter}
                                    placeholder="Filter Toko"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setOnlineUsersStoreFilter(value); setOnlineUsersPage(1); }}
                                    searchable
                                />
                                <input
                                    type="text"
                                    placeholder="Cari nama atau NIK..."
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={onlineUsersSearch}
                                    onChange={(e) => { setOnlineUsersSearch(e.target.value); setOnlineUsersPage(1); }}
                                />
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {onlineUsersData.length === 0 ? (
                                <div className="p-8 text-center text-sm text-gray-400">Belum ada user yang terdeteksi sedang membuka aplikasi.</div>
                            ) : onlineUsersData.map((row) => (
                                <ActivityRow key={`${row.username}-${row.id || row.last_seen_at}`} row={row} mode="online" />
                            ))}
                        </div>
                        <PaginationControls page={onlineUsersPage} totalPages={onlineUsersTotalPages} onPageChange={setOnlineUsersPage} />
                    </div>

                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="space-y-4 border-b border-gray-100 px-6 py-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="font-black text-gray-900">Login 7 Hari Terakhir</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-primary">{recentLoginsTotal} login</span>
                                    <button onClick={fetchRecentLogins} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:border-primary hover:text-primary">
                                        Muat Ulang
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-[260px_1fr] gap-3">
                                <CustomSelect
                                    value={recentLoginsStoreFilter}
                                    placeholder="Filter Toko"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setRecentLoginsStoreFilter(value); setRecentLoginsPage(1); }}
                                    searchable
                                />
                                <input
                                    type="text"
                                    placeholder="Cari nama atau NIK..."
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={recentLoginsSearch}
                                    onChange={(e) => { setRecentLoginsSearch(e.target.value); setRecentLoginsPage(1); }}
                                />
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {recentLoginsData.length === 0 ? (
                                <div className="p-8 text-center text-sm text-gray-400">Belum ada user yang login dalam 7 hari terakhir.</div>
                            ) : recentLoginsData.map((row) => (
                                <ActivityRow key={row.username} row={row} mode="login" />
                            ))}
                        </div>
                        <PaginationControls page={recentLoginsPage} totalPages={recentLoginsTotalPages} onPageChange={setRecentLoginsPage} />
                    </div>
                </div>
            )}

            {activeTab === 'users' && canAccess('users_locations') && (
                <div className={`grid h-[clamp(360px,calc(100dvh-24rem),680px)] items-stretch gap-6 transition-all duration-300 ${
                    isUserFormOpen && isRoleFormOpen
                        ? 'grid-cols-[1fr_0.75fr_0.75fr]'
                        : (isUserFormOpen || isRoleFormOpen)
                            ? 'grid-cols-[1.2fr_0.8fr]'
                            : 'grid-cols-1'
                }`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Master User</h2>
                            <div className="w-64">
                                <CustomSelect
                                    value={storeFilter}
                                    placeholder="Filter Toko"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setStoreFilter(value); setUsersPage(1); }}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 max-w-md relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari nama atau NIK..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={usersSearch}
                                    onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }}
                                />
                            </div>
                            <button onClick={() => { resetUserForm(); setIsUserFormOpen(true); }} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 flex items-center gap-2 whitespace-nowrap">
                                <UserPlus size={16} />
                                User Baru
                            </button>
                            {canAccess('role_management') && (
                                <button onClick={resetRoleForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">
                                    Tambah Role Akun
                                </button>
                            )}
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {usersData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">User tidak ditemukan.</div>
                            ) : usersData.map((user) => (
                                <button key={user.username} onClick={() => { selectUser(user); setIsUserFormOpen(true); }} className={`w-full text-left px-6 py-4 hover:bg-purple-50 transition ${selectedUsername === user.username ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{userIdentityLabel(user)}</p>
                                            <p className="text-xs font-semibold text-gray-400">{user.division_name || '-'}</p>
                                        </div>
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${user.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {user.active ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Lokasi: {user.locations.map((location) => location.initial).join(', ') || '-'} - Atasan: {user.leader?.name || '-'} - Bawahan: {user.subordinates_count}
                                    </p>
                                </button>
                            ))}
                        </div>
                        <PaginationControls
                            page={usersPage}
                            totalPages={usersTotalPages}
                            onPageChange={setUsersPage}
                        />
                    </div>

                    {isUserFormOpen && (
                        <form onSubmit={saveUser} className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data User</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedUsername ? 'Ubah User' : 'Buat User'}</h2>
                                </div>
                                <button type="button" onClick={closeUserForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                            </div>
                            <Field label="NIK / Username">
                                <input disabled={!!selectedUsername} value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="input" required />
                            </Field>
                            <Field label="Nama">
                                <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="input" required />
                            </Field>
                            <Field label="Email">
                                <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="input" />
                            </Field>
                            <Field label="Initial Toko">
                                <CustomSelect
                                    value={userForm.initial_store}
                                    placeholder="Pilih initial toko"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => setUserForm({ ...userForm, initial_store: value })}
                                />
                            </Field>
                            <Field label="Password">
                                <input type="password" minLength={8} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="input" placeholder={selectedUsername ? 'Kosongkan jika tidak ingin mengganti password' : 'Opsional untuk user YoJadwal; wajib untuk akun CMS'} />
                            </Field>
                            {canAccess('role_management') && (
                                <Field label="Role Akun">
                                    <CustomSelect
                                        value={userForm.role_id}
                                        placeholder="Pilih role akun"
                                        options={data.roles.map((role) => ({ value: String(role.id), label: role.name }))}
                                        onChange={(value) => setUserForm({ ...userForm, role_id: value })}
                                    />
                                </Field>
                            )}
                            <Field label="Job Level HR/Corporate">
                                <CustomSelect
                                    value={userForm.job_level_id}
                                    placeholder="Pilih job level HR"
                                    options={data.job_levels.map((level) => ({ value: String(level.id), label: level.position_code ? `${level.position_code} - ${level.name}` : level.name }))}
                                    onChange={(value) => setUserForm({ ...userForm, job_level_id: value })}
                                />
                            </Field>
                            <Field label="Divisi">
                                <CustomSelect
                                    value={userForm.division_id}
                                    placeholder="Pilih divisi"
                                    options={data.divisions
                                        .filter((division) => division.visible_in_yodaily || String(division.id) === userForm.division_id)
                                        .map((division) => ({
                                            value: String(division.id),
                                            label: `${division.name} (${division.group_code})`,
                                            secondaryLabel: division.parent_name || division.name,
                                        }))}
                                    onChange={(value) => setUserForm({ ...userForm, division_id: value })}
                                    searchable
                                />
                            </Field>
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} />
                                User aktif
                            </label>
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                <input type="checkbox" checked={userForm.is_back_office} onChange={(e) => setUserForm({ ...userForm, is_back_office: e.target.checked })} />
                                Back Office
                            </label>
                            <Field label="Lokasi">
                                <CustomMultiSelect
                                    values={userForm.location_ids}
                                    placeholder="Pilih lokasi"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(values) => setUserForm({ ...userForm, location_ids: values })}
                                />
                                <div className="hidden">
                                    {([] as Location[]).map((location) => (
                                        <label key={location.initial} className={`text-xs rounded-xl px-3 py-2 border cursor-pointer ${userForm.location_ids.includes(location.initial) ? 'border-primary bg-purple-50 text-primary' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                                            <input type="checkbox" className="hidden" checked={userForm.location_ids.includes(location.initial)} onChange={() => toggleLocation(location.initial)} />
                                            {location.initial} · {location.name}
                                        </label>
                                    ))}
                                </div>
                            </Field>
                            <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                                {saving ? 'Menyimpan...' : 'Simpan User'}
                            </button>
                        </form>
                    )}

                    {isRoleFormOpen && (
                        <form onSubmit={saveRole} className="h-full min-h-0 space-y-5 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data Role Akun</p>
                                    <h2 className="text-xl font-black text-gray-900">{roleForm.id ? 'Ubah Role Akun' : 'Buat Role Akun'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {roleForm.id && !['admin', 'user'].includes(roleForm.name.toLowerCase()) && (
                                        <button type="button" onClick={() => deleteRole(roleForm.id)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeRoleForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                            <Field label="Nama Role">
                                <input
                                    value={roleForm.name}
                                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                                    className="input"
                                    disabled={['admin', 'user'].includes(roleForm.name.toLowerCase())}
                                    required
                                />
                            </Field>
                            <Field label="Deskripsi">
                                <input
                                    value={roleForm.description}
                                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                                    className="input"
                                    placeholder="Deskripsi singkat role"
                                />
                            </Field>
                            <div>
                                <p className="text-sm font-bold text-gray-700 mb-3">Hak Akses</p>
                                <div className="space-y-3">
                                    {data.cms_permissions.map((permission) => (
                                        <label key={permission.key} className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={roleForm.name.toLowerCase() === 'admin' || roleForm.permissions.includes(permission.key)}
                                                disabled={roleForm.name.toLowerCase() === 'admin'}
                                                onChange={() => toggleRolePermission(permission.key)}
                                                className="w-4 h-4"
                                            />
                                            {permission.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-sm font-black text-gray-800 mb-3">Daftar Role Akun</p>
                                <div className="space-y-2 max-h-52 overflow-y-auto">
                                    {data.roles.map((role) => (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => selectRole(role)}
                                            className={`w-full text-left rounded-xl px-3 py-2 transition ${roleForm.id === String(role.id) ? 'bg-purple-100 text-primary' : 'bg-white hover:bg-purple-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-bold text-sm capitalize">{role.name}</span>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-primary">{role.users_count || 0} user</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{role.description || '-'}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button disabled={saving} className="bg-primary text-white rounded-xl py-3 px-8 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 self-start">
                                {saving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {activeTab === 'jobLevels' && canAccess('job_levels') && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-black text-gray-900">Master Job Level HR</h2>
                            <p className="text-xs text-gray-400">Tampilkan atau sembunyikan posisi resmi HR dari pengaturan user YoDaily.</p>
                        </div>
                        <div className="w-52">
                            <CustomSelect
                                value={jobLevelsVisibility}
                                placeholder="Semua visibilitas"
                                options={[
                                    { value: 'visible', label: 'Tampil di YoDaily' },
                                    { value: 'hidden', label: 'Disembunyikan dari YoDaily' },
                                ]}
                                onChange={(value) => { setJobLevelsVisibility(value); setJobLevelsPage(1); }}
                            />
                        </div>
                        <div className="flex-1 max-w-md relative">
                            <input
                                type="text"
                                placeholder="Cari posisi, kode, grade, departemen..."
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                value={jobLevelsSearch}
                                onChange={(event) => { setJobLevelsSearch(event.target.value); setJobLevelsPage(1); }}
                            />
                        </div>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                        {jobLevelsData.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">Job level tidak ditemukan.</div>
                        ) : jobLevelsData.map((jobLevel) => (
                            <div key={jobLevel.id} className="px-6 py-4 grid grid-cols-[1.2fr_0.7fr_0.8fr_180px] gap-4 items-center hover:bg-gray-50 transition">
                                <div>
                                    <p className="font-black text-gray-900">{jobLevel.name}</p>
                                    <p className="text-xs text-gray-400">{jobLevel.position_code || '-'} - {jobLevel.description || jobLevel.department || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Grade</p>
                                    <p className="text-sm font-bold text-gray-700">{jobLevel.grade || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Department</p>
                                    <p className="text-sm font-bold text-gray-700">{jobLevel.department || '-'}</p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${jobLevel.visible_in_yodaily ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                        {jobLevel.visible_in_yodaily ? 'Tampil' : 'Tersembunyi'}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => toggleJobLevelVisibility(jobLevel)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50 ${jobLevel.visible_in_yodaily ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-primary text-white shadow-md shadow-purple-100'}`}
                                    >
                                        {jobLevel.visible_in_yodaily ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <PaginationControls
                        page={jobLevelsPage}
                        totalPages={jobLevelsTotalPages}
                        onPageChange={setJobLevelsPage}
                    />
                </div>
            )}

            {activeTab === 'divisions' && canAccess('divisions') && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-black text-gray-900">Master Divisi</h2>
                            <p className="text-xs text-gray-400">Atur divisi yang dapat dipilih pada data user YoDaily.</p>
                        </div>
                        <div className="w-52">
                            <CustomSelect
                                value={divisionsVisibility}
                                placeholder="Semua visibilitas"
                                options={[
                                    { value: 'visible', label: 'Tampil di YoDaily' },
                                    { value: 'hidden', label: 'Disembunyikan dari YoDaily' },
                                ]}
                                onChange={(value) => { setDivisionsVisibility(value); setDivisionsPage(1); }}
                            />
                        </div>
                        <div className="flex-1 max-w-md relative">
                            <input
                                type="text"
                                placeholder="Cari divisi, kode, atau induk..."
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                value={divisionsSearch}
                                onChange={(event) => { setDivisionsSearch(event.target.value); setDivisionsPage(1); }}
                            />
                        </div>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                        {divisionsData.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">Divisi tidak ditemukan.</div>
                        ) : divisionsData.map((division) => (
                            <div key={division.id} className="px-6 py-4 grid grid-cols-[1.2fr_0.7fr_0.8fr_180px] gap-4 items-center hover:bg-gray-50 transition">
                                <div>
                                    <p className="font-black text-gray-900">{division.name}</p>
                                    <p className="text-xs text-gray-400">{division.code}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Grup</p>
                                    <p className="text-sm font-bold text-gray-700">{division.group_code}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Induk</p>
                                    <p className="text-sm font-bold text-gray-700">{division.parent_name || '-'}</p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${division.visible_in_yodaily ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                        {division.visible_in_yodaily ? 'Tampil' : 'Tersembunyi'}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => toggleDivisionVisibility(division)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50 ${division.visible_in_yodaily ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-primary text-white shadow-md shadow-purple-100'}`}
                                    >
                                        {division.visible_in_yodaily ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <PaginationControls page={divisionsPage} totalPages={divisionsTotalPages} onPageChange={setDivisionsPage} />
                </div>
            )}

            {activeTab === 'appRoles' && canAccess('app_roles') && (
                <div className={`grid h-[clamp(360px,calc(100dvh-24rem),680px)] items-stretch gap-6 transition-all duration-300 ${isAppRoleFormOpen ? 'grid-cols-[1.2fr_0.8fr]' : 'grid-cols-1'}`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-black text-gray-900">Role Aplikasi per Lokasi</h2>
                            </div>
                            <div className="w-64">
                                <CustomSelect
                                    value={storeFilter}
                                    placeholder="Filter Toko"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setStoreFilter(value); setUserLocationsPage(1); }}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari user atau lokasi..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={userLocationsSearch}
                                    onChange={(e) => { setUserLocationsSearch(e.target.value); setUserLocationsPage(1); }}
                                />
                            </div>
                            <button onClick={resetAppRoleForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">
                                Tambah Role Aplikasi
                            </button>
                            <button disabled={saving} onClick={syncUserLocations} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 whitespace-nowrap">
                                Sinkron dari User
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {userLocationsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Assignment tidak ditemukan.</div>
                            ) : userLocationsData.map((assignment) => (
                                <div key={assignment.id} className="px-6 py-4 grid grid-cols-[1fr_1fr_260px] gap-4 items-center">
                                    <div>
                                        <p className="font-black text-gray-900">{assignment.user_name || assignment.user_id}</p>
                                        <p className="text-xs text-gray-400">{assignment.user_id}</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-700">{assignment.location_name || assignment.location_id}</p>
                                        <p className="text-xs text-gray-400">{assignment.location_id}</p>
                                    </div>
                                    <CustomSelect
                                        value={assignment.job_level || ''}
                                        placeholder="Pilih role aplikasi"
                                        options={data.app_job_levels.map((level) => ({ value: level, label: level }))}
                                        onChange={(value) => value && updateUserLocationRole(assignment, value)}
                                    />
                                </div>
                            ))}
                        </div>
                        <PaginationControls
                            page={userLocationsPage}
                            totalPages={userLocationsTotalPages}
                            onPageChange={setUserLocationsPage}
                        />
                    </div>

                    {isAppRoleFormOpen && (
                        <form onSubmit={saveAppRole} className="h-full min-h-0 space-y-5 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data Role Aplikasi</p>
                                    <h2 className="text-xl font-black text-gray-900">{appRoleForm.id ? 'Ubah Role Aplikasi' : 'Buat Role Aplikasi'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {appRoleForm.id && (
                                        <button type="button" onClick={() => deleteAppRole(appRoleForm.id)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeAppRoleForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                            <Field label="Nama Role">
                                <input
                                    value={appRoleForm.name}
                                    onChange={(e) => setAppRoleForm({ ...appRoleForm, name: e.target.value })}
                                    className="input"
                                    required
                                />
                            </Field>

                            <Field label="Deskripsi">
                                <input
                                    value={appRoleForm.description}
                                    onChange={(e) => setAppRoleForm({ ...appRoleForm, description: e.target.value })}
                                    className="input"
                                    placeholder="Deskripsi singkat role"
                                />
                            </Field>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={appRoleForm.active}
                                        onChange={(e) => setAppRoleForm({ ...appRoleForm, active: e.target.checked })}
                                    />
                                    Role aplikasi aktif
                                </label>
                            </div>

                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-sm font-black text-gray-800 mb-3">Daftar Role Aplikasi</p>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {data.app_roles.map((role) => (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => selectAppRole(role)}
                                            className={`w-full text-left rounded-xl px-3 py-2 transition ${appRoleForm.id === String(role.id) ? 'bg-purple-100 text-primary' : 'bg-white hover:bg-purple-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-bold text-sm">{role.name}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${role.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                                    {role.active ? 'Aktif' : 'Tidak Aktif'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{role.description || '-'} · {role.users_count || 0} assignment</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button disabled={saving} className="bg-primary text-white rounded-xl py-3 px-8 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 self-start">
                                {saving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {activeTab === 'hierarchy' && canAccess('reporting_lines') && (
                <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                    <form onSubmit={saveReportingLine} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Hierarchy</p>
                                <h2 className="text-xl font-black text-gray-900">Atur Atasan</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsReportingImportOpen(true); setReportingImportFile(null); setReportingImportPreview(null); setReportingImportError(''); }}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-lg shadow-purple-100"
                            >
                                <Upload size={15} /> Import XLSX
                            </button>
                        </div>
                        <Field label="Filter Toko">
                            <CustomSelect
                                value={storeFilter}
                                placeholder="Filter Toko"
                                options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                onChange={(value) => { setStoreFilter(value); setSelectedLeaderId(''); setUsersPage(1); }}
                                searchable
                            />
                        </Field>
                        <Field label="Atasan">
                            <CustomSelect
                                value={lineForm.leader_id}
                                placeholder="Pilih atasan"
                                options={leadersData.map((user) => ({ value: user.username, label: userIdentityLabel(user), secondaryLabel: user.division_name || '-' }))}
                                onChange={selectReportingLeader}
                                searchable
                            />
                        </Field>
                        <Field label="Bawahan">
                            <CustomMultiSelect
                                values={lineForm.subordinate_ids}
                                placeholder="Pilih bawahan"
                                options={reportingUsersData
                                    .filter((user) => user.username !== lineForm.leader_id)
                                    .map((user) => ({ value: user.username, label: userIdentityLabel(user), secondaryLabel: user.division_name || '-' }))}
                                onChange={(values) => setLineForm({ ...lineForm, subordinate_ids: values })}
                            />
                        </Field>
                            <Field label="Status">
                            <CustomSelect
                                value={lineForm.status}
                                placeholder="Pilih status"
                                options={[
                                    { value: 'active', label: 'active' },
                                    { value: 'inactive', label: 'inactive' },
                                ]}
                                onChange={(value) => setLineForm({ ...lineForm, status: value as 'active' | 'inactive' })}
                            />
                        </Field>
                        <p className="text-xs text-gray-400 mt-2">Pilih satu atau beberapa bawahan, lalu simpan sekali untuk menghubungkan ke atasan terpilih.</p>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            Simpan Relasi
                        </button>
                    </form>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-4">
                            <div className="flex-1">
                                <h2 className="font-black text-gray-900 mb-2">Filter Bawahan berdasarkan Atasan</h2>
                                <CustomSelect
                                    value={selectedLeaderId}
                                    placeholder="Pilih atasan untuk melihat relasinya..."
                                    options={leadersData.map((user) => ({ value: user.username, label: userIdentityLabel(user), secondaryLabel: user.division_name || '-' }))}
                                    onChange={(value) => setSelectedLeaderId(value)}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 self-end relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari bawahan..." 
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={hierarchySearch}
                                    onChange={(e) => setHierarchySearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {!selectedLeaderId ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Pilih atasan terlebih dahulu untuk melihat daftar bawahannya.</div>
                            ) : reportingLinesData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Bawahan untuk atasan ini tidak ditemukan.</div>
                            ) : reportingLinesData.filter(line => `${line.subordinate_name || ''} ${line.subordinate_id} ${line.subordinate_division_name || ''} ${line.subordinate_division_group_code || ''}`.toLowerCase().includes(hierarchySearch.toLowerCase())).map((line) => (
                                <div key={line.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Subordinate</p>
                                        <p className="font-black text-gray-900 text-lg">{userIdentityLabel({ username: line.subordinate_id, name: line.subordinate_name || line.subordinate_id, role_type: line.subordinate_role_type, division_group_code: line.subordinate_division_group_code })}</p>
                                        <p className="mt-1 text-xs font-semibold text-gray-400">{line.subordinate_division_name || '-'}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${line.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {line.status}
                                        </span>
                                        <button onClick={() => toggleReportingLineStatus(line)} className="text-xs font-bold text-primary hover:bg-purple-50 px-3 py-2 rounded-xl">
                                            {line.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button onClick={() => deleteReportingLine(line.id)} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl">Hapus</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'guides' && canAccess('work_stations') && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
                        <div>
                            <h2 className="font-black text-gray-900">Master Work Station</h2>
                            <p className="text-xs text-gray-400">Kelola kategori, panduan, area, dan daftar tugas.</p>
                        </div>
                        <div className="flex rounded-xl bg-gray-100 p-1">
                            <button type="button" onClick={() => setWorkStationSection('guides')} className={`rounded-lg px-4 py-2 text-xs font-black transition ${workStationSection === 'guides' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Panduan</button>
                            <button type="button" onClick={() => setWorkStationSection('catalog')} className={`rounded-lg px-4 py-2 text-xs font-black transition ${workStationSection === 'catalog' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Area & Master Task</button>
                        </div>
                    </div>

                    {workStationSection === 'guides' ? (
                <div className={`grid h-[clamp(360px,calc(100dvh-28rem),640px)] items-stretch gap-6 transition-all duration-300 ${isGuideFormOpen ? 'grid-cols-[0.8fr_1.2fr]' : 'grid-cols-1'}`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-black text-gray-900 whitespace-nowrap">Master Work Station</h2>
                                <p className="text-xs text-gray-400">Kelola ketersediaan station dan isi panduan crew.</p>
                            </div>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari station..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={guidesSearch}
                                    onChange={(e) => setGuidesSearch(e.target.value)}
                                />
                            </div>
                            <button onClick={() => { setGuideForm({ id: '', name: '', guideText: '', active: true }); setIsGuideFormOpen(true); }} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">Work Station Baru</button>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {data.work_stations.filter(station => station.name.toLowerCase().includes(guidesSearch.toLowerCase())).map((station) => (
                                <button key={station.id} onClick={() => selectGuide(station)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${guideForm.id === String(station.id) ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="font-black text-gray-900 capitalize">{station.name}</p>
                                            <p className="text-xs text-gray-400">{station.guide_content.length} guide item(s)</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${station.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {station.active ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isGuideFormOpen && (
                        <form onSubmit={saveGuide} className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Work Station</p>
                                    <h2 className="text-xl font-black text-gray-900">{guideForm.id ? 'Ubah Work Station' : 'Buat Work Station'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {guideForm.id && (
                                        <button type="button" onClick={() => deleteWorkStation(guideForm.id)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeGuideForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                        <Field label="Nama Station">
                            <input value={guideForm.name} onChange={(e) => setGuideForm({ ...guideForm, name: e.target.value })} className="input" required />
                        </Field>
                        <Field label="Status">
                            <CustomSelect
                                value={guideForm.active ? 'active' : 'inactive'}
                                placeholder="Pilih status"
                                options={[
                                    { value: 'active', label: 'Aktif - tersedia untuk tugas baru dan pilihan panduan crew' },
                                    { value: 'inactive', label: 'Tidak aktif - disembunyikan dari alur operasional baru' },
                                ]}
                                onChange={(value) => setGuideForm({ ...guideForm, active: value !== 'inactive' })}
                            />
                        </Field>
                        <Field label="Isi Panduan">
                            <textarea
                                value={guideForm.guideText}
                                onChange={(e) => setGuideForm({ ...guideForm, guideText: e.target.value })}
                                className="input min-h-[320px]"
                                placeholder="Satu item panduan per baris"
                            />
                        </Field>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 flex items-center justify-center gap-2">
                            <Save size={16} />
                            {saving ? 'Menyimpan...' : 'Simpan Work Station'}
                        </button>
                    </form>
                )}
                </div>
                    ) : (
                        <div className="grid h-[clamp(460px,calc(100dvh-28rem),680px)] min-h-0 grid-cols-1 gap-4 xl:grid-cols-[0.7fr_1fr_1.3fr]">
                            <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                                <div className="space-y-3 border-b border-gray-100 p-5">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Kategori</p>
                                        <h3 className="font-black text-gray-900">Work Station</h3>
                                    </div>
                                    <input value={taskCategorySearch} onChange={(event) => setTaskCategorySearch(event.target.value)} className="input" placeholder="Cari kategori..." />
                                </div>
                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                                    {filteredCatalogStations.map((station) => (
                                        <button key={station.id} type="button" onClick={() => selectCatalogStation(station)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedCatalogStationId === String(station.id) ? 'border-primary bg-purple-50' : 'border-gray-100 hover:border-purple-200'}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="font-black capitalize text-gray-900">{station.name}</p>
                                                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${station.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{station.active ? 'Aktif' : 'Nonaktif'}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-gray-400">{station.task_areas?.length || 0} area</p>
                                        </button>
                                    ))}
                                    {filteredCatalogStations.length === 0 && <p className="p-4 text-center text-sm text-gray-400">Kategori tidak ditemukan.</p>}
                                </div>
                                <p className="border-t border-gray-100 px-5 py-3 text-[11px] leading-5 text-gray-400">Kategori baru dibuat dari tab Panduan agar tetap memakai master Work Station yang sama.</p>
                            </section>

                            <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                                <div className="space-y-3 border-b border-gray-100 p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Area</p>
                                            <h3 className="font-black capitalize text-gray-900">{selectedCatalogStation?.name || 'Pilih kategori'}</h3>
                                        </div>
                                        {selectedCatalogStation && <button type="button" onClick={openNewTaskAreaForm} className="rounded-xl bg-purple-50 px-3 py-2 text-xs font-black text-primary">Area Baru</button>}
                                    </div>
                                    <input value={taskAreaSearch} onChange={(event) => setTaskAreaSearch(event.target.value)} className="input" placeholder="Cari area..." disabled={!selectedCatalogStation} />
                                </div>
                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                                    {filteredTaskAreas.map((area) => (
                                        <button key={area.id} type="button" onClick={() => selectTaskArea(area)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedTaskAreaId === String(area.id) ? 'border-primary bg-purple-50' : 'border-gray-100 hover:border-purple-200'}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="font-bold text-gray-900">{area.name}</p>
                                                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${area.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{area.active ? 'Aktif' : 'Nonaktif'}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-gray-400">{area.task_definitions.length} task</p>
                                        </button>
                                    ))}
                                    {selectedCatalogStation && filteredTaskAreas.length === 0 && <p className="p-4 text-center text-sm text-gray-400">{normalizedAreaSearch ? 'Area tidak ditemukan.' : 'Belum ada area pada kategori ini.'}</p>}
                                </div>
                                {selectedCatalogStation && isTaskAreaFormOpen && (
                                    <form onSubmit={saveTaskArea} className="space-y-3 border-t border-gray-100 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-black uppercase tracking-wider text-gray-500">{taskAreaForm.id ? 'Ubah Area' : 'Area Baru'}</p>
                                            <div className="flex items-center gap-3">
                                                {taskAreaForm.id && <button type="button" onClick={() => selectedTaskArea && deleteTaskArea(selectedTaskArea)} className="text-xs font-bold text-red-500">Hapus</button>}
                                                <button type="button" onClick={closeTaskAreaForm} className="p-1 text-gray-400 transition hover:text-gray-900" aria-label="Tutup form area"><X size={17} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
                                            <input value={taskAreaForm.name} onChange={(event) => setTaskAreaForm({ ...taskAreaForm, name: event.target.value })} className="input" placeholder="Nama area" required />
                                            <CustomSelect value={taskAreaForm.active ? 'active' : 'inactive'} placeholder="Status" searchable={false} options={[{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }]} onChange={(value) => setTaskAreaForm({ ...taskAreaForm, active: value === 'active' })} />
                                        </div>
                                        <button disabled={saving} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Area'}</button>
                                    </form>
                                )}
                            </section>

                            <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                                <div className="space-y-3 border-b border-gray-100 p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Master Task</p>
                                            <h3 className="font-black text-gray-900">{selectedTaskArea?.name || 'Pilih area'}</h3>
                                        </div>
                                        {selectedTaskArea && <button type="button" onClick={openNewTaskDefinitionForm} className="rounded-xl bg-purple-50 px-3 py-2 text-xs font-black text-primary">Task Baru</button>}
                                    </div>
                                    <input value={taskDefinitionSearch} onChange={(event) => setTaskDefinitionSearch(event.target.value)} className="input" placeholder="Cari task..." disabled={!selectedTaskArea} />
                                </div>
                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                                    {filteredTaskDefinitions.map((definition) => (
                                        <button key={definition.id} type="button" onClick={() => selectTaskDefinition(definition)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${taskDefinitionForm.id === String(definition.id) ? 'border-primary bg-purple-50' : 'border-gray-100 hover:border-purple-200'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="font-bold leading-5 text-gray-900">{definition.title}</p>
                                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${definition.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{definition.active ? 'Aktif' : 'Nonaktif'}</span>
                                            </div>
                                        </button>
                                    ))}
                                    {selectedTaskArea && filteredTaskDefinitions.length === 0 && <p className="p-4 text-center text-sm text-gray-400">{normalizedTaskSearch ? 'Task tidak ditemukan.' : 'Belum ada master task pada area ini.'}</p>}
                                </div>
                                {selectedTaskArea && isTaskDefinitionFormOpen && (
                                    <form onSubmit={saveTaskDefinition} className="space-y-3 border-t border-gray-100 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-black uppercase tracking-wider text-gray-500">{taskDefinitionForm.id ? 'Ubah Master Task' : 'Master Task Baru'}</p>
                                            <div className="flex items-center gap-3">
                                                {taskDefinitionForm.id && <button type="button" onClick={() => {
                                                    const definition = selectedTaskArea.task_definitions.find((item) => String(item.id) === taskDefinitionForm.id);
                                                    if (definition) deleteTaskDefinition(definition);
                                                }} className="text-xs font-bold text-red-500">Hapus</button>}
                                                <button type="button" onClick={closeTaskDefinitionForm} className="p-1 text-gray-400 transition hover:text-gray-900" aria-label="Tutup form master task"><X size={17} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
                                            <input value={taskDefinitionForm.title} onChange={(event) => setTaskDefinitionForm({ ...taskDefinitionForm, title: event.target.value })} className="input" placeholder="Judul tugas" required />
                                            <CustomSelect value={taskDefinitionForm.active ? 'active' : 'inactive'} placeholder="Status" searchable={false} options={[{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }]} onChange={(value) => setTaskDefinitionForm({ ...taskDefinitionForm, active: value === 'active' })} />
                                        </div>
                                        <button disabled={saving} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Master Task'}</button>
                                    </form>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'scoring' && canAccess('scoring_masters') && (
                <div className="grid h-[clamp(460px,calc(100dvh-24rem),760px)] min-h-0 grid-cols-[1.35fr_0.65fr] gap-6">
                    <form onSubmit={saveScoringRule} className="min-h-0 space-y-6 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Formula Penilaian</p>
                                <h2 className="mt-1 text-xl font-black text-gray-900">Master Penilaian</h2>
                                <p className="mt-1 text-sm text-gray-500">Simpan sebagai versi baru agar nilai periode lama tetap memakai formula sebelumnya.</p>
                            </div>
                            <Field label="Berlaku mulai bulan">
                                <input type="month" value={scoringForm.effective_from.slice(0, 7)} onChange={(e) => setScoringForm({ ...scoringForm, effective_from: `${e.target.value}-01` })} className="input min-w-44" required />
                            </Field>
                        </div>

                        <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-gray-900">Bobot Nilai Bulanan</h3>
                                    <p className="text-xs text-gray-500">Tugas + absensi + evaluasi harus tepat 100%.</p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-black ${Math.abs(monthlyWeightTotal - 100) <= 0.01 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{monthlyWeightTotal.toFixed(2)}%</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Field label="Tugas (%)"><input type="number" min="0" max="100" step="0.001" value={scoringForm.task_weight} onChange={(e) => setScoringForm({ ...scoringForm, task_weight: e.target.value })} className="input" required /></Field>
                                <Field label="Absensi (%)"><input type="number" min="0" max="100" step="0.001" value={scoringForm.attendance_weight} onChange={(e) => setScoringForm({ ...scoringForm, attendance_weight: e.target.value })} className="input" required /></Field>
                                <Field label="Evaluasi (%)"><input type="number" min="0" max="100" step="0.001" value={scoringForm.evaluation_weight} onChange={(e) => setScoringForm({ ...scoringForm, evaluation_weight: e.target.value })} className="input" required /></Field>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-100 p-5">
                            <div className="mb-4 flex items-end justify-between gap-4">
                                <div>
                                    <h3 className="font-black text-gray-900">Aturan Absensi & Hari Tugas</h3>
                                    <p className="text-xs text-gray-500">Status dihitung absensi menambah capaian target. Bebas tugas mengeluarkan hari itu dari pembagi nilai tugas.</p>
                                </div>
                                <Field label="Target status / bulan">
                                    <input type="number" min="1" max="999" value={scoringForm.attendance_target} onChange={(e) => setScoringForm({ ...scoringForm, attendance_target: e.target.value })} className="input w-32" required />
                                </Field>
                            </div>
                            {Number(scoringForm.attendance_target) > 31 && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Target melebihi jumlah hari kalender. Nilai tetap dihitung sesuai target yang disimpan.</p>}
                            <div className="overflow-hidden rounded-xl border border-gray-100">
                                <div className="grid grid-cols-[1fr_150px_150px] bg-gray-50 px-4 py-2 text-xs font-black uppercase text-gray-400"><span>Status</span><span className="text-center">Dihitung Absensi</span><span className="text-center">Bebas Tugas</span></div>
                                {scoringStatuses.map((status) => (
                                    <div key={status} className="grid grid-cols-[1fr_150px_150px] items-center border-t border-gray-100 px-4 py-3 text-sm">
                                        <span className="font-black text-gray-800">{status}</span>
                                        <input type="checkbox" checked={scoringForm.attendance_included_statuses.includes(status)} onChange={() => toggleScoringStatus('attendance_included_statuses', status)} />
                                        <input type="checkbox" checked={scoringForm.task_excluded_statuses.includes(status)} onChange={() => toggleScoringStatus('task_excluded_statuses', status)} />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex gap-2">
                                <input value={newScoringStatus} onChange={(e) => setNewScoringStatus(e.target.value.toUpperCase())} className="input" maxLength={20} placeholder="Tambah kode status, mis. IK" />
                                <button type="button" onClick={() => { const status = newScoringStatus.trim(); if (!status) return; setScoringForm((current) => ({ ...current, attendance_included_statuses: current.attendance_included_statuses.includes(status) ? current.attendance_included_statuses : [...current.attendance_included_statuses, status] })); setNewScoringStatus(''); }} className="rounded-xl border border-purple-100 px-4 text-sm font-bold text-primary hover:bg-purple-50">Tambah</button>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-gray-900">Komposisi Nilai Tugas Kasir</h3>
                                    <p className="text-xs text-gray-500">Rata-rata tugas, IBOP, dan push selling. Data Beyond yang belum tersedia tidak dianggap nol.</p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-black ${Math.abs(cashierWeightTotal - 100) <= 0.01 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{cashierWeightTotal.toFixed(2)}%</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Field label="Tugas reguler (%)"><input type="number" min="0" max="100" step="0.0001" value={scoringForm.cashier_task_weight} onChange={(e) => setScoringForm({ ...scoringForm, cashier_task_weight: e.target.value })} className="input" required /></Field>
                                <Field label="IBOP (%)"><input type="number" min="0" max="100" step="0.0001" value={scoringForm.cashier_ibop_weight} onChange={(e) => setScoringForm({ ...scoringForm, cashier_ibop_weight: e.target.value })} className="input" required /></Field>
                                <Field label="Push Selling (%)"><input type="number" min="0" max="100" step="0.0001" value={scoringForm.cashier_push_selling_weight} onChange={(e) => setScoringForm({ ...scoringForm, cashier_push_selling_weight: e.target.value })} className="input" required /></Field>
                            </div>
                        </section>

                        <button disabled={saving || Math.abs(monthlyWeightTotal - 100) > 0.01 || Math.abs(cashierWeightTotal - 100) > 0.01} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white shadow-lg shadow-purple-100 disabled:opacity-50"><Save size={16} />{saving ? 'Menyimpan...' : 'Simpan Versi Baru'}</button>
                    </form>

                    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 px-5 py-4">
                            <h2 className="font-black text-gray-900">Riwayat Formula</h2>
                            <p className="text-xs text-gray-400">Versi terbaru yang efektif dipakai otomatis.</p>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                            {data.scoring_rules.length === 0 ? <p className="p-6 text-sm text-gray-400">Belum ada versi formula.</p> : data.scoring_rules.map((rule, index) => (
                                <button type="button" key={rule.id} onClick={() => setScoringForm({ ...scoringFormFromRule(rule), effective_from: nextScoringEffectiveDate(data.scoring_rules) })} className="w-full p-5 text-left transition hover:bg-purple-50">
                                    <div className="flex items-center justify-between gap-3"><p className="font-black text-gray-900">Mulai {new Date(`${rule.effective_from}T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>{index === 0 && <span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-black text-green-600">TERBARU</span>}</div>
                                    <p className="mt-2 text-xs text-gray-500">Tugas {rule.task_weight}% · Absensi {rule.attendance_weight}% · Evaluasi {rule.evaluation_weight}%</p>
                                    <p className="mt-1 text-xs text-gray-400">Target absensi {rule.attendance_target} · oleh {rule.created_by || 'sistem'}</p>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'evaluations' && canAccess('evaluation_masters') && (
                <div className={`grid h-[clamp(360px,calc(100dvh-24rem),680px)] items-stretch gap-6 transition-all duration-300 ${isEvaluationFormOpen ? 'grid-cols-[0.8fr_1.2fr]' : 'grid-cols-1'}`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-black text-gray-900">Master Evaluasi</h2>
                                <p className="text-xs text-gray-400">Kelola pertanyaan evaluasi bulanan.</p>
                            </div>
                            <button onClick={resetEvaluationForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">Evaluasi Baru</button>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {data.evaluation_masters.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Item evaluasi tidak ditemukan.</div>
                            ) : data.evaluation_masters.map((item) => (
                                <button key={item.id} onClick={() => selectEvaluation(item)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 transition ${evaluationForm.id === String(item.id) ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{item.question}</p>
                                            <p className="text-xs text-gray-400">{item.title} - {item.subtitle}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${item.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {item.active ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isEvaluationFormOpen && (
                        <form onSubmit={saveEvaluationMaster} className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data Evaluasi</p>
                                    <h2 className="text-xl font-black text-gray-900">{evaluationForm.id ? 'Ubah Evaluasi' : 'Buat Evaluasi'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {evaluationForm.id && (
                                        <button type="button" onClick={() => deleteEvaluationMaster(evaluationForm.id)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeEvaluationForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                                <div className="space-y-4">
                                    <Field label="Judul">
                                        <input value={evaluationForm.title} onChange={(e) => setEvaluationForm({ ...evaluationForm, title: e.target.value })} className="input" required />
                                    </Field>
                                    <Field label="Sub Judul">
                                        <input value={evaluationForm.subtitle} onChange={(e) => setEvaluationForm({ ...evaluationForm, subtitle: e.target.value })} className="input" required />
                                    </Field>
                                    <Field label="Kategori">
                                        <input value={evaluationForm.question} onChange={(e) => setEvaluationForm({ ...evaluationForm, question: e.target.value })} className="input" required />
                                    </Field>
                                    {evaluationForm.answers.map((answer, index) => (
                                        <Field key={index} label={`Poin ${index + 1}`}>
                                            <div className="flex gap-2">
                                                <input
                                                    value={answer}
                                                    onChange={(e) => {
                                                        const nextAnswers = [...evaluationForm.answers];
                                                        nextAnswers[index] = e.target.value;
                                                        setEvaluationForm({ ...evaluationForm, answers: nextAnswers });
                                                    }}
                                                    className="input"
                                                    required
                                                />
                                                {evaluationForm.answers.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEvaluationForm({ ...evaluationForm, answers: evaluationForm.answers.filter((_, itemIndex) => itemIndex !== index) })}
                                                        className="px-3 rounded-xl border border-red-100 text-red-500 text-xs font-bold hover:bg-red-50"
                                                    >
                                                        Hapus
                                                    </button>
                                                )}
                                            </div>
                                        </Field>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setEvaluationForm({ ...evaluationForm, answers: [...evaluationForm.answers, ''] })}
                                        className="px-4 py-2 rounded-xl border border-purple-100 text-primary text-sm font-bold hover:bg-purple-50"
                                    >
                                        Tambah Poin
                                    </button>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Urutan">
                                            <input type="number" value={evaluationForm.sort_order} onChange={(e) => setEvaluationForm({ ...evaluationForm, sort_order: e.target.value })} className="input" />
                                        </Field>
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 pt-7">
                                            <input type="checkbox" checked={evaluationForm.active} onChange={(e) => setEvaluationForm({ ...evaluationForm, active: e.target.checked })} />
                                            Aktif
                                        </label>
                                    </div>
                                    <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                                        {saving ? 'Menyimpan...' : 'Simpan Evaluasi'}
                                    </button>
                                </div>

                                <div className="bg-gray-50 rounded-3xl border border-gray-100 p-6">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Preview Evaluasi</p>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">{evaluationForm.title || 'EVALUASI BULANAN'}</h2>
                                    <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">{evaluationForm.subtitle || 'SIKAP KEPRIBADIAN'}</p>
                                    <div>
                                        <h3 className="font-semibold text-gray-700 mb-1">{evaluationForm.question || 'Judul kategori'}</h3>
                                        <div className="text-xs text-gray-500 mb-3 leading-relaxed space-y-1">
                                            {evaluationForm.answers.map((answer, index) => (
                                                <p key={index}>{index + 1}. {answer || `Poin ${index + 1}`}</p>
                                            ))}
                                        </div>
                                        <div className="flex justify-between items-center px-2">
                                            {[1, 2, 3, 4, 5].map((score) => (
                                                <div key={score} className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-white text-gray-400 shadow-sm">
                                                    {score}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {activeTab === 'locations' && canAccess('locations') && (
                <div className={`grid h-[clamp(360px,calc(100dvh-24rem),680px)] items-stretch gap-6 transition-all duration-300 ${isLocationFormOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Master Lokasi</h2>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari lokasi..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={locationsSearch}
                                    onChange={(e) => { setLocationsSearch(e.target.value); setLocationsPage(1); }}
                                />
                            </div>
                            <button onClick={resetLocationForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">Lokasi Baru</button>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {locationsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Lokasi tidak ditemukan.</div>
                            ) : locationsData.map((location) => (
                                <button key={location.initial} onClick={() => selectLocation(location)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 transition ${selectedLocationInitial === location.initial ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{location.name}</p>
                                            <p className="text-xs text-gray-400">{location.initial} - Toko {location.store_code || '-'} - {location.city || '-'}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${Boolean(location.is_active ?? true) ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {Boolean(location.is_active ?? true) ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <PaginationControls
                            page={locationsPage}
                            totalPages={locationsTotalPages}
                            onPageChange={setLocationsPage}
                        />
                    </div>

                    {isLocationFormOpen && (
                        <form onSubmit={saveLocation} className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data Lokasi</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedLocationInitial ? 'Ubah Lokasi' : 'Buat Lokasi'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedLocationInitial && (
                                        <button type="button" onClick={() => deleteLocation(selectedLocationInitial)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeLocationForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                        <Field label="Initial">
                            <input disabled={!!selectedLocationInitial} value={locationForm.initial} onChange={(e) => setLocationForm({ ...locationForm, initial: e.target.value.toUpperCase() })} className="input" required />
                        </Field>
                        <Field label="Nama">
                            <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} className="input" required />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Kode Toko">
                                <input type="number" value={locationForm.store_code} onChange={(e) => setLocationForm({ ...locationForm, store_code: e.target.value })} className="input" />
                            </Field>
                            <Field label="Kode Regional">
                                <input type="number" value={locationForm.region_code} onChange={(e) => setLocationForm({ ...locationForm, region_code: e.target.value })} className="input" />
                            </Field>
                        </div>
                        <Field label="Kota">
                            <input value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} className="input" />
                        </Field>
                        <Field label="Alamat">
                            <input value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} className="input" />
                        </Field>
                        <Field label="Telepon">
                            <input value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} className="input" />
                        </Field>
                        <Field label="Tipe Toko">
                            <input value={locationForm.type_store} onChange={(e) => setLocationForm({ ...locationForm, type_store: e.target.value })} className="input" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <input type="checkbox" checked={locationForm.is_active} onChange={(e) => setLocationForm({ ...locationForm, is_active: e.target.checked })} />
                            Lokasi aktif
                        </label>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            {saving ? 'Menyimpan...' : 'Simpan Lokasi'}
                        </button>
                    </form>
                    )}
                </div>
            )}

            {activeTab === 'regionals' && canAccess('regionals') && (
                <div className={`grid h-[clamp(360px,calc(100dvh-24rem),680px)] items-stretch gap-6 transition-all duration-300 ${isRegionalFormOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Master Regional</h2>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Cari regional..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={regionalsSearch}
                                    onChange={(e) => { setRegionalsSearch(e.target.value); setRegionalsPage(1); }}
                                />
                            </div>
                            <button onClick={resetRegionalForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">Regional Baru</button>
                        </div>
                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                            {regionalsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Regional tidak ditemukan.</div>
                            ) : regionalsData.map((regional) => (
                                <button key={regional.id} onClick={() => selectRegional(regional)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 transition ${selectedRegionalId === regional.id ? 'bg-purple-50' : ''}`}>
                                    <p className="font-black text-gray-900">{regional.nama_regional}</p>
                                    <p className="text-xs text-gray-400">Kode: {regional.kode_regional} · Cabang: {regional.cabang || '-'}</p>
                                </button>
                            ))}
                        </div>
                        <PaginationControls
                            page={regionalsPage}
                            totalPages={regionalsTotalPages}
                            onPageChange={setRegionalsPage}
                        />
                    </div>

                    {isRegionalFormOpen && (
                        <form onSubmit={saveRegional} className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Data Regional</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedRegionalId ? 'Ubah Regional' : 'Buat Regional'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedRegionalId && (
                                        <button type="button" onClick={() => deleteRegional(selectedRegionalId)} className="text-sm font-bold text-red-500">Hapus</button>
                                    )}
                                    <button type="button" onClick={closeRegionalForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                        <Field label="Kode Regional">
                            <input value={regionalForm.kode_regional} onChange={(e) => setRegionalForm({ ...regionalForm, kode_regional: e.target.value })} className="input" required />
                        </Field>
                        <Field label="Nama Regional">
                            <input value={regionalForm.nama_regional} onChange={(e) => setRegionalForm({ ...regionalForm, nama_regional: e.target.value })} className="input" required />
                        </Field>
                        <Field label="Cabang">
                            <input value={regionalForm.cabang} onChange={(e) => setRegionalForm({ ...regionalForm, cabang: e.target.value })} className="input" placeholder="Initial toko atau catatan cabang" />
                        </Field>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            {saving ? 'Menyimpan...' : 'Simpan Regional'}
                        </button>
                    </form>
                    )}
                </div>
            )}

            {isReportingImportOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-gray-950/40 p-4 backdrop-blur-[2px]">
                    <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Relasi Atasan</p>
                                <h2 className="mt-1 text-2xl font-black text-gray-900">Import Spreadsheet</h2>
                                <p className="mt-2 text-sm text-gray-500">Satu baris berisi satu NIK bawahan dan maksimal sepuluh NIK atasan.</p>
                            </div>
                            <button type="button" disabled={reportingImportBusy} onClick={closeReportingImport} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr]">
                            <button type="button" onClick={downloadReportingTemplate} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 text-sm font-bold text-primary hover:bg-purple-50">
                                <Download size={17} /> Unduh Template
                            </button>
                            <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 hover:border-primary">
                                <FileSpreadsheet size={20} className="shrink-0 text-primary" />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-600">{reportingImportFile?.name || 'Pilih file .xlsx'}</span>
                                <input
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="hidden"
                                    onChange={(event) => {
                                        setReportingImportFile(event.target.files?.[0] || null);
                                        setReportingImportPreview(null);
                                        setReportingImportError('');
                                    }}
                                />
                            </label>
                        </div>

                        {reportingImportError && (
                            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                                {reportingImportError}
                            </div>
                        )}

                        {reportingImportPreview && (
                            <div className="mt-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {[
                                        ['Pasangan', reportingImportPreview.summary.relations, 'text-gray-900'],
                                        ['Valid', reportingImportPreview.summary.valid, 'text-green-600'],
                                        ['Duplikat', reportingImportPreview.summary.duplicates, 'text-amber-600'],
                                        ['Invalid', reportingImportPreview.summary.invalid, 'text-red-500'],
                                    ].map(([label, value, color]) => (
                                        <div key={String(label)} className="rounded-2xl bg-gray-50 p-3 text-center">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                                            <p className={`mt-1 text-xl font-black ${color}`}>{value}</p>
                                        </div>
                                    ))}
                                </div>

                                {reportingImportRows.length > 0 && (
                                    <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-100">
                                        {reportingImportRows.map((issue, index) => (
                                            <div key={`${issue.row}-${issue.leader_id}-${index}`} className={`border-b px-4 py-3 last:border-0 ${issue.importStatus === 'valid' ? 'border-green-100 bg-green-50/50' : issue.importStatus === 'duplicate' ? 'border-amber-100 bg-amber-50/50' : 'border-red-100 bg-red-50/50'}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-black text-gray-700">Baris {issue.row}: {issue.subordinate_id || '-'} &rarr; {issue.leader_id || '-'}</p>
                                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${issue.importStatus === 'valid' ? 'bg-green-100 text-green-700' : issue.importStatus === 'duplicate' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                                        {issue.importStatus === 'valid' ? 'Valid' : issue.importStatus === 'duplicate' ? 'Duplikat' : 'Invalid'}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500">{issue.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {reportingImportPreview.details_limited && <p className="text-xs text-gray-400">Detail dibatasi hingga 100 item per kategori.</p>}
                            </div>
                        )}

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button type="button" disabled={reportingImportBusy} onClick={closeReportingImport} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 disabled:opacity-40">Batal</button>
                            {!reportingImportPreview ? (
                                <button type="button" disabled={!reportingImportFile || reportingImportBusy} onClick={previewReportingImport} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-100 disabled:opacity-40">
                                    {reportingImportBusy ? 'Memeriksa...' : 'Periksa File'}
                                </button>
                            ) : (
                                <button type="button" disabled={reportingImportPreview.summary.valid === 0 || reportingImportBusy} onClick={commitReportingImport} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-100 disabled:opacity-40">
                                    {reportingImportBusy ? 'Mengimport...' : `Import ${reportingImportPreview.summary.valid} Relasi`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

function TabButton({ active, expanded, icon, label, onClick }: { active: boolean; expanded: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={!expanded ? label : undefined}
            className={`flex w-full items-center rounded-xl p-3 text-sm font-bold transition-colors ${expanded ? 'gap-3' : 'justify-center'} ${active ? 'bg-primary text-white shadow-lg shadow-purple-100' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
        >
            <span className="shrink-0">{icon}</span>
            {expanded && <span className="truncate">{label}</span>}
        </button>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-sm font-bold text-gray-700">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}

function ActivityRow({ row, mode }: { row: UserActivityRow; mode: 'online' | 'login' }) {
    const locations = row.locations?.map((location) => location.initial).join(', ') || '-';
    const roles = row.app_roles?.join(', ') || row.role_type || '-';
    const primaryTime = mode === 'online' ? row.last_seen_at : row.latest_login_at;
    const timeLabel = mode === 'online' ? row.last_seen_label : row.latest_login_label;
    const badgeText = mode === 'online'
        ? (row.device_type || 'online')
        : (row.device_type || row.login_source || 'login');
    const loginCountLabel = `${row.login_count || 0} kali login`;

    return (
        <div className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="truncate font-black text-gray-900">{row.name}</p>
                    <p className="mt-1 text-xs text-gray-400">{row.username} - {roles}</p>
                    <p className="mt-2 text-xs text-gray-500">Lokasi: {locations}</p>
                </div>
                <div className="shrink-0 text-right">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${mode === 'online' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-primary'}`}>
                        {badgeText}
                    </span>
                    <p className="mt-2 text-xs font-semibold text-gray-500">{formatActivityDate(primaryTime)}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{timeLabel || '-'}</p>
                    {mode === 'login' && (
                        <p className="mt-1 text-[11px] font-semibold text-primary">{loginCountLabel}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function formatActivityDate(value?: string | null) {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
    const [jumpPage, setJumpPage] = useState('');
    const safeTotal = Math.max(totalPages, 1);
    const safePage = Math.min(Math.max(page, 1), safeTotal);

    const goToPage = (target: number) => {
        const nextPage = Math.min(Math.max(target, 1), safeTotal);
        if (nextPage !== safePage) onPageChange(nextPage);
    };

    const pageItems = (() => {
        if (safeTotal <= 7) return Array.from({ length: safeTotal }, (_, i) => i + 1);

        const items: Array<number | string> = [1];
        const start = Math.max(2, safePage - 1);
        const end = Math.min(safeTotal - 1, safePage + 1);

        if (start > 2) items.push('left-ellipsis');
        for (let current = start; current <= end; current++) items.push(current);
        if (end < safeTotal - 1) items.push('right-ellipsis');
        items.push(safeTotal);

        return items;
    })();

    const submitJump = (event: React.FormEvent) => {
        event.preventDefault();
        const target = Number(jumpPage);
        if (Number.isFinite(target)) goToPage(target);
        setJumpPage('');
    };

    return (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
                <button
                    disabled={safePage <= 1}
                    onClick={() => goToPage(safePage - 1)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-30 hover:text-primary hover:border-primary transition"
                >
                    Sebelumnya
                </button>

                <div className="flex flex-shrink-0 items-center gap-1">
                    {pageItems.map((item) => typeof item === 'number' ? (
                        <button
                            key={item}
                            onClick={() => goToPage(item)}
                            className={`min-w-9 px-3 py-2 rounded-xl text-xs font-black transition ${item === safePage
                                ? 'bg-primary text-white shadow-md shadow-purple-100'
                                : 'bg-white border border-gray-200 text-gray-600 hover:text-primary hover:border-primary'
                                }`}
                        >
                            {item}
                        </button>
                    ) : (
                        <span key={item} className="px-2 text-xs font-black text-gray-400">...</span>
                    ))}
                </div>

                <button
                    disabled={safePage >= safeTotal}
                    onClick={() => goToPage(safePage + 1)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-30 hover:text-primary hover:border-primary transition"
                >
                    Berikutnya
                </button>
            </div>

            <form onSubmit={submitJump} className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">Halaman {safePage} dari {safeTotal}</span>
                <input
                    type="number"
                    min={1}
                    max={safeTotal}
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value)}
                    placeholder="Ke"
                    className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-purple-100"
                />
                <button className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:text-primary hover:border-primary transition">
                    Buka
                </button>
            </form>
        </div>
    );
}

function getDropdownStyle(ref: React.RefObject<HTMLDivElement | null>, preferredHeight = 288): React.CSSProperties | undefined {
    if (!ref.current) return undefined;

    const rect = ref.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(96, Math.min(preferredHeight, openUp ? spaceAbove - gap : spaceBelow - gap));

    if (openUp) {
        return {
            position: 'fixed',
            bottom: window.innerHeight - rect.top + gap,
            left: rect.left,
            width: rect.width,
            maxHeight: availableHeight,
        };
    }

    return {
        position: 'fixed',
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: availableHeight,
    };
}

type SelectOption = { value: string; label: string; secondaryLabel?: string };

function CustomSelect({ value, placeholder, options, onChange, searchable = true }: { value: string; placeholder: string; options: SelectOption[]; onChange: (value: string) => void; searchable?: boolean }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = options.find((option) => option.value === value);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = searchable ? options.filter((option) => `${option.label} ${option.secondaryLabel || ''}`.toLowerCase().includes(search.toLowerCase())) : options;
    const dropdownStyle = open ? getDropdownStyle(ref, 256) : undefined;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen((current) => !current); setSearch(''); }}
                className="input flex items-center justify-between text-left gap-4"
            >
                <span className={`flex min-w-0 flex-col ${selected ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                    <span className="truncate">{selected?.label || placeholder}</span>
                    {selected?.secondaryLabel && <span className="truncate text-[11px] font-medium text-gray-400">{selected.secondaryLabel}</span>}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div style={dropdownStyle} className="z-[9999] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl flex flex-col">
                    {searchable && (
                        <div className="p-2 sticky top-0 bg-white z-10 border-b border-gray-100">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Cari..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            onChange('');
                            setOpen(false);
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${!value ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                        {placeholder}
                    </button>
                    {filteredOptions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400">Tidak ada pilihan yang cocok</div>
                    ) : filteredOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onChange(option.value);
                                setOpen(false);
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${option.value === value ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{option.label}</span>
                                {option.secondaryLabel && <span className="truncate text-[11px] font-medium text-gray-400">{option.secondaryLabel}</span>}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function CustomMultiSelect({ values, placeholder, options, onChange }: { values: string[]; placeholder: string; options: SelectOption[]; onChange: (values: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOptions = options.filter((option) => values.includes(option.value));
    const filteredOptions = options.filter((option) => `${option.label} ${option.secondaryLabel || ''}`.toLowerCase().includes(search.toLowerCase()));
    const dropdownStyle = open ? getDropdownStyle(ref, 288) : undefined;
    const summary = selectedOptions.length === 0
        ? placeholder
        : selectedOptions.length <= 2
            ? selectedOptions.map((option) => option.label).join(', ')
            : `${selectedOptions.length} dipilih`;

    const toggleValue = (value: string) => {
        onChange(values.includes(value)
            ? values.filter((item) => item !== value)
            : [...values, value]);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen((current) => !current); setSearch(''); }}
                className="input flex items-center justify-between text-left gap-4"
            >
                <span className={`truncate ${selectedOptions.length ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{summary}</span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div style={dropdownStyle} className="z-[9999] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl flex flex-col">
                    <div className="p-2 sticky top-0 bg-white z-10 border-b border-gray-100">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Cari..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </div>
                    <button
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            onChange([]);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-500 hover:bg-gray-50"
                    >
                        Hapus pilihan
                    </button>
                    {filteredOptions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400">Tidak ada pilihan yang cocok</div>
                    ) : filteredOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                toggleValue(option.value);
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm flex items-center gap-3 ${values.includes(option.value) ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <span className={`h-4 w-4 rounded border flex items-center justify-center ${values.includes(option.value) ? 'border-primary bg-primary' : 'border-gray-300 bg-white'}`}>
                                {values.includes(option.value) && <Check size={12} className="text-white" />}
                            </span>
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{option.label}</span>
                                {option.secondaryLabel && <span className="truncate text-[11px] font-medium text-gray-400">{option.secondaryLabel}</span>}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
