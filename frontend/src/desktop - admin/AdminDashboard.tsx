import React, { useEffect, useState, useRef } from 'react';
import { BookOpenCheck, Check, ChevronDown, GitBranch, MapPinned, RefreshCcw, Save, ShieldCheck, UserCog, UserPlus, UsersRound, X } from 'lucide-react';

type Tab = 'users' | 'jobLevels' | 'appRoles' | 'hierarchy' | 'guides' | 'locations' | 'regionals' | 'evaluations';

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
    role_id?: number | null;
    account_role?: string | null;
    job_level_name?: string;
    job_level_position_code?: string | null;
    role_type?: string;
    active: boolean;
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
    subordinate_id: string;
    subordinate_name?: string;
    status: 'active' | 'inactive';
};

type WorkStation = {
    id: number;
    name: string;
    guide_content: string[];
    active: boolean;
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
        job_levels: number;
    };
    roles: AccountRole[];
    app_roles: AppRole[];
    cms_permissions: Array<{ key: string; label: string }>;
    current_account_role?: string | null;
    current_permissions: string[];
    job_levels: JobLevel[];
    locations: Location[];
    work_stations: WorkStation[];
    app_job_levels: string[];
    regionals: Regional[];
    evaluation_masters: EvaluationMaster[];
};

const emptyUserForm = {
    username: '',
    name: '',
    email: '',
    password: '',
    initial_store: '',
    role_id: '',
    job_level_id: '',
    active: true,
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

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [data, setData] = useState<CmsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    
    const [usersData, setUsersData] = useState<CmsUser[]>([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersTotalPages, setUsersTotalPages] = useState(1);
    const [usersSearch, setUsersSearch] = useState('');

    const [jobLevelsData, setJobLevelsData] = useState<JobLevel[]>([]);
    const [jobLevelsPage, setJobLevelsPage] = useState(1);
    const [jobLevelsTotalPages, setJobLevelsTotalPages] = useState(1);
    const [jobLevelsSearch, setJobLevelsSearch] = useState('');
    const [jobLevelsVisibility, setJobLevelsVisibility] = useState('');

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
    const [hierarchySearch, setHierarchySearch] = useState('');

    const [leadersData, setLeadersData] = useState<Array<{username: string, name: string, role_type: string}>>([]);
    const [selectedLeaderId, setSelectedLeaderId] = useState('');
    const [reportingLinesData, setReportingLinesData] = useState<ReportingLine[]>([]);

    const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
    const [userForm, setUserForm] = useState(emptyUserForm);
    const [lineForm, setLineForm] = useState({ leader_id: '', subordinate_ids: [] as string[], status: 'active' as 'active' | 'inactive' });
    const [guideForm, setGuideForm] = useState({ id: '', name: '', guideText: '', active: true });
    const [evaluationForm, setEvaluationForm] = useState(emptyEvaluationForm);
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

    useEffect(() => {
        fetchOverview();
    }, []);

    useEffect(() => {
        if (!data) return;
        if (activeTab === 'users') fetchUsers();
        else if (activeTab === 'jobLevels') fetchJobLevels();
        else if (activeTab === 'appRoles') {
            fetchUserLocations();
            fetchUsers();
        }
        else if (activeTab === 'hierarchy') {
            fetchUsers();
            fetchLeaders();
            fetchReportingLines();
        }
        else if (activeTab === 'locations') fetchLocations();
        else if (activeTab === 'regionals') fetchRegionals();
    }, [activeTab, usersPage, usersSearch, jobLevelsPage, jobLevelsSearch, jobLevelsVisibility, userLocationsPage, userLocationsSearch, locationsPage, locationsSearch, regionalsPage, regionalsSearch, selectedLeaderId, storeFilter, data?.stats]);

    const fetchOverview = async () => {
        setLoading(true);
        setMessage('');
        try {
            const payload = await requestJson('/api/cms/overview', 'GET');
            setData(payload);
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
            active: user.active,
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

    const isAdminRole = data.current_account_role === 'admin';
    const canAccess = (permission: string) => isAdminRole || data.current_permissions.includes(permission);

    return (
        <div className="h-full overflow-y-auto px-8 py-8">
            <header className="mb-8 flex items-start justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-400 font-bold">YoDaily CMS</p>
                    <h1 className="text-3xl font-extrabold text-gray-900 mt-2">Panel Admin</h1>
                    <p className="text-gray-500 mt-2">Kelola user, role, relasi, assignment tempat kerja, work station, lokasi, regional, dan evaluasi.</p>
                </div>
                <button onClick={fetchOverview} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-semibold hover:bg-gray-50">
                    <RefreshCcw size={16} />
                    Muat Ulang
                </button>
            </header>

            <section className="grid grid-cols-6 gap-4 mb-6">
                {[
                    ['User', data.stats.users],
                    ['Aktif', data.stats.active_users],
                    ['Reporting Line', data.stats.reporting_lines],
                    ['Role Aplikasi', data.stats.app_roles],
                    ['Lokasi', data.stats.locations],
                    ['Regional', data.stats.regionals],
                ].map(([label, value]) => (
                    <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-xs text-gray-400 font-bold uppercase">{label}</p>
                        <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
                    </div>
                ))}
            </section>

            {message && (
                <div className="mb-5 rounded-2xl bg-purple-50 border border-purple-100 text-primary px-4 py-3 text-sm font-semibold">
                    {message}
                </div>
            )}

            <div className="flex gap-3 mb-6">
                {canAccess('users_locations') && <TabButton active={activeTab === 'users'} icon={<UsersRound size={16} />} label="User & Lokasi" onClick={() => setActiveTab('users')} />}
                {canAccess('users_locations') && <TabButton active={activeTab === 'jobLevels'} icon={<ShieldCheck size={16} />} label="Job Level HR" onClick={() => setActiveTab('jobLevels')} />}
                {canAccess('users_locations') && <TabButton active={activeTab === 'appRoles'} icon={<UserCog size={16} />} label="Role Aplikasi" onClick={() => setActiveTab('appRoles')} />}
                {canAccess('reporting_lines') && <TabButton active={activeTab === 'hierarchy'} icon={<GitBranch size={16} />} label="Relasi Atasan" onClick={() => setActiveTab('hierarchy')} />}
                <TabButton active={activeTab === 'guides'} icon={<BookOpenCheck size={16} />} label="Master Work Station" onClick={() => setActiveTab('guides')} />
                {canAccess('locations') && <TabButton active={activeTab === 'locations'} icon={<MapPinned size={16} />} label="Master Lokasi" onClick={() => setActiveTab('locations')} />}
                {canAccess('regionals') && <TabButton active={activeTab === 'regionals'} icon={<MapPinned size={16} />} label="Master Regional" onClick={() => setActiveTab('regionals')} />}
                {canAccess('evaluation_masters') && <TabButton active={activeTab === 'evaluations'} icon={<ShieldCheck size={16} />} label="Master Evaluasi" onClick={() => setActiveTab('evaluations')} />}
            </div>

            {activeTab === 'users' && (
                <div className={`grid gap-6 transition-all duration-300 ${
                    isUserFormOpen && isRoleFormOpen
                        ? 'grid-cols-[1fr_0.75fr_0.75fr]'
                        : (isUserFormOpen || isRoleFormOpen)
                            ? 'grid-cols-[1.2fr_0.8fr]'
                            : 'grid-cols-1'
                }`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
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
                            {isAdminRole && (
                                <button onClick={resetRoleForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">
                                    Tambah Role Akun
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
                            {usersData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">User tidak ditemukan.</div>
                            ) : usersData.map((user) => (
                                <button key={user.username} onClick={() => { selectUser(user); setIsUserFormOpen(true); }} className={`w-full text-left px-6 py-4 hover:bg-purple-50 transition ${selectedUsername === user.username ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{user.name}</p>
                                            <p className="text-xs text-gray-400">{user.username} - {user.job_level_name || 'Belum ada role'}</p>
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
                        <form onSubmit={saveUser} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
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
                                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="input" placeholder={selectedUsername ? 'Kosongkan jika tidak ingin mengganti password' : 'Default: password'} />
                            </Field>
                            <Field label="Role Akun">
                                <CustomSelect
                                    value={userForm.role_id}
                                    placeholder="Pilih role akun"
                                    options={data.roles.map((role) => ({ value: String(role.id), label: role.name }))}
                                    onChange={(value) => setUserForm({ ...userForm, role_id: value })}
                                />
                            </Field>
                            <Field label="Job Level HR/Corporate">
                                <CustomSelect
                                    value={userForm.job_level_id}
                                    placeholder="Pilih job level HR"
                                    options={data.job_levels.map((level) => ({ value: String(level.id), label: level.position_code ? `${level.position_code} - ${level.name}` : level.name }))}
                                    onChange={(value) => setUserForm({ ...userForm, job_level_id: value })}
                                />
                            </Field>
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} />
                                User aktif
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
                        <form onSubmit={saveRole} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
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

            {activeTab === 'jobLevels' && (
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

            {activeTab === 'appRoles' && (
                <div className={`grid gap-6 transition-all duration-300 ${isAppRoleFormOpen ? 'grid-cols-[1.2fr_0.8fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
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
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
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
                        <form onSubmit={saveAppRole} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
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

            {activeTab === 'hierarchy' && (
                <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                    <form onSubmit={saveReportingLine} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Hierarchy</p>
                            <h2 className="text-xl font-black text-gray-900">Atur Atasan</h2>
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
                                options={leadersData.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                onChange={selectReportingLeader}
                                searchable
                            />
                        </Field>
                        <Field label="Bawahan">
                            <CustomMultiSelect
                                values={lineForm.subordinate_ids}
                                placeholder="Pilih bawahan"
                                options={usersData
                                    .filter((user) => user.username !== lineForm.leader_id)
                                    .map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
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
                                    options={leadersData.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
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
                            ) : reportingLinesData.filter(line => (line.subordinate_name || line.subordinate_id).toLowerCase().includes(hierarchySearch.toLowerCase())).map((line) => (
                                <div key={line.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Subordinate</p>
                                        <p className="font-black text-gray-900 text-lg">{line.subordinate_name || line.subordinate_id}</p>
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

            {activeTab === 'guides' && (
                <div className={`grid gap-6 transition-all duration-300 ${isGuideFormOpen ? 'grid-cols-[0.8fr_1.2fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
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
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
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
                        <form onSubmit={saveGuide} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
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
            )}

            {activeTab === 'evaluations' && (
                <div className={`grid gap-6 transition-all duration-300 ${isEvaluationFormOpen ? 'grid-cols-[0.8fr_1.2fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-black text-gray-900">Master Evaluasi</h2>
                                <p className="text-xs text-gray-400">Kelola pertanyaan evaluasi bulanan.</p>
                            </div>
                            <button onClick={resetEvaluationForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">Evaluasi Baru</button>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
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
                        <form onSubmit={saveEvaluationMaster} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
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

            {activeTab === 'locations' && (
                <div className={`grid gap-6 transition-all duration-300 ${isLocationFormOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
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
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
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
                        <form onSubmit={saveLocation} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
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

            {activeTab === 'regionals' && (
                <div className={`grid gap-6 transition-all duration-300 ${isRegionalFormOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
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
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
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
                        <form onSubmit={saveRegional} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
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


        </div>
    );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition ${active ? 'bg-primary text-white shadow-lg shadow-purple-100' : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'}`}>
            {icon}
            {label}
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
            <div className="flex items-center gap-2">
                <button
                    disabled={safePage <= 1}
                    onClick={() => goToPage(safePage - 1)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-30 hover:text-primary hover:border-primary transition"
                >
                    Sebelumnya
                </button>

                <div className="flex items-center gap-1">
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

function CustomSelect({ value, placeholder, options, onChange, searchable = true }: { value: string; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; searchable?: boolean }) {
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

    const filteredOptions = searchable ? options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase())) : options;
    const dropdownStyle = open ? getDropdownStyle(ref, 256) : undefined;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen((current) => !current); setSearch(''); }}
                className="input flex items-center justify-between text-left gap-4"
            >
                <span className={`truncate ${selected ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{selected?.label || placeholder}</span>
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
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function CustomMultiSelect({ values, placeholder, options, onChange }: { values: string[]; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (values: string[]) => void }) {
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
    const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));
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
                            <span className="truncate">{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
