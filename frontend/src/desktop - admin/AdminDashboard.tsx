import React, { useEffect, useState, useRef } from 'react';
import { BookOpenCheck, ChevronDown, GitBranch, MapPinned, RefreshCcw, Save, ShieldCheck, UserCog, UserPlus, UsersRound, X } from 'lucide-react';

type Tab = 'users' | 'appRoles' | 'hierarchy' | 'guides' | 'locations' | 'regionals' | 'evaluations';

type JobLevel = {
    id: number;
    name: string;
    description?: string;
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
    answers: ['', '', '', '', ''],
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
    const [lineForm, setLineForm] = useState({ leader_id: '', subordinate_id: '', status: 'active' as 'active' | 'inactive' });
    const [guideForm, setGuideForm] = useState({ id: '', name: '', guideText: '' });
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
    }, [activeTab, usersPage, usersSearch, userLocationsPage, userLocationsSearch, locationsPage, locationsSearch, regionalsPage, regionalsSearch, selectedLeaderId, storeFilter, data?.stats]);

    const fetchOverview = async () => {
        setLoading(true);
        setMessage('');
        try {
            const payload = await requestJson('/api/cms/overview', 'GET');
            setData(payload);
        } catch (error: any) {
            setMessage(error.message || 'Failed to load CMS data.');
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
            setMessage(error.message || 'Failed to load users.');
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
            setMessage(error.message || 'Failed to load user locations.');
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
            setMessage(error.message || 'Failed to load locations.');
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
            setMessage(error.message || 'Failed to load regionals.');
        }
    };

    const fetchLeaders = async () => {
        try {
            const query = new URLSearchParams();
            if (storeFilter) query.append('store', storeFilter);
            const res = await requestJson(`/api/cms/leaders?${query.toString()}`, 'GET');
            setLeadersData(res || []);
        } catch (error: any) {
            setMessage(error.message || 'Failed to load leaders.');
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
            setMessage(error.message || 'Failed to load reporting lines.');
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
            setMessage(error.message || 'Failed to save user.');
        } finally {
            setSaving(false);
        }
    };

    const saveReportingLine = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await requestJson('/api/cms/reporting-lines', 'POST', lineForm);
            setLineForm({ leader_id: '', subordinate_id: '', status: 'active' });
            setMessage('Reporting line saved.');
            await fetchReportingLines();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save reporting line.');
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
            setMessage(error.message || 'Failed to delete reporting line.');
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
            setMessage(error.message || 'Failed to update reporting line.');
        } finally {
            setSaving(false);
        }
    };

    const selectGuide = (station: WorkStation) => {
        setGuideForm({
            id: String(station.id),
            name: station.name,
            guideText: station.guide_content.join('\n'),
        });
        setIsGuideFormOpen(true);
    };

    const closeGuideForm = () => {
        setGuideForm({ id: '', name: '', guideText: '' });
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
            };

            if (guideForm.id) {
                await requestJson(`/api/cms/work-stations/${guideForm.id}`, 'PATCH', payload);
                setMessage('Guide updated.');
            } else {
                await requestJson('/api/cms/work-stations', 'POST', payload);
                setMessage('Guide created.');
            }

            closeGuideForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save guide.');
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
                setMessage('Location updated.');
            } else {
                await requestJson('/api/cms/locations', 'POST', payload);
                setMessage('Location created.');
            }

            closeLocationForm();
            await fetchLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save location.');
        } finally {
            setSaving(false);
        }
    };

    const deleteLocation = async (initial: string) => {
        if (!window.confirm('Delete this location? Assigned locations cannot be deleted.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/locations/${initial}`, 'DELETE');
            setMessage('Location deleted.');
            closeLocationForm();
            await fetchLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete location.');
        } finally {
            setSaving(false);
        }
    };

    const updateUserLocationRole = async (assignment: UserLocationAssignment, jobLevel: string) => {
        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/user-locations/${assignment.id}`, 'PATCH', { job_level: jobLevel });
            setMessage('Application role updated.');
            await fetchUserLocations();
        } catch (error: any) {
            setMessage(error.message || 'Failed to update application role.');
        } finally {
            setSaving(false);
        }
    };

    const syncUserLocations = async () => {
        setSaving(true);
        setMessage('');
        try {
            const payload = await requestJson('/api/cms/user-locations/sync', 'POST');
            setMessage(payload?.message || 'User locations synchronized.');
            await fetchUserLocations();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to synchronize user locations.');
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
            answers: [...item.answers, '', '', '', '', ''].slice(0, 5),
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
                answers: evaluationForm.answers,
                sort_order: evaluationForm.sort_order ? Number(evaluationForm.sort_order) : 0,
                active: evaluationForm.active,
            };

            if (evaluationForm.id) {
                await requestJson(`/api/cms/evaluation-masters/${evaluationForm.id}`, 'PATCH', payload);
                setMessage('Evaluation master updated.');
            } else {
                await requestJson('/api/cms/evaluation-masters', 'POST', payload);
                setMessage('Evaluation master created.');
            }

            closeEvaluationForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save evaluation master.');
        } finally {
            setSaving(false);
        }
    };

    const deleteEvaluationMaster = async (id: string) => {
        if (!id || !window.confirm('Delete this evaluation item?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/evaluation-masters/${id}`, 'DELETE');
            setMessage('Evaluation item deleted.');
            closeEvaluationForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete evaluation item.');
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
                setMessage('Role updated.');
            } else {
                await requestJson('/api/cms/roles', 'POST', payload);
                setMessage('Role created.');
            }

            closeRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save role.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRole = async (id: string) => {
        if (!id || !window.confirm('Delete this role?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/roles/${id}`, 'DELETE');
            setMessage('Role deleted.');
            closeRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete role.');
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
                setMessage('App role updated.');
            } else {
                await requestJson('/api/cms/app-roles', 'POST', payload);
                setMessage('App role created.');
            }

            closeAppRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save app role.');
        } finally {
            setSaving(false);
        }
    };

    const deleteAppRole = async (id: string) => {
        if (!id || !window.confirm('Delete this app role? Assigned roles cannot be deleted.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/app-roles/${id}`, 'DELETE');
            setMessage('App role deleted.');
            closeAppRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete app role.');
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
                setMessage('Regional updated.');
            } else {
                await requestJson('/api/cms/regionals', 'POST', regionalForm);
                setMessage('Regional created.');
            }

            closeRegionalForm();
            await fetchRegionals();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save regional.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRegional = async (id: number) => {
        if (!window.confirm('Delete this regional?')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/regionals/${id}`, 'DELETE');
            setMessage('Regional deleted.');
            closeRegionalForm();
            await fetchRegionals();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete regional.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center text-gray-400">Loading CMS...</div>;
    }

    if (!data) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500">
                <p>{message || 'Failed to load CMS data.'}</p>
                <button onClick={fetchOverview} className="px-4 py-2 bg-primary text-white rounded-xl">Retry</button>
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
                    <h1 className="text-3xl font-extrabold text-gray-900 mt-2">Admin Panel</h1>
                    <p className="text-gray-500 mt-2">Manage users, hierarchy, store assignment, and crew guides.</p>
                </div>
                <button onClick={fetchOverview} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-semibold hover:bg-gray-50">
                    <RefreshCcw size={16} />
                    Refresh
                </button>
            </header>

            <section className="grid grid-cols-5 gap-4 mb-6">
                {[
                    ['Users', data.stats.users],
                    ['Active', data.stats.active_users],
                    ['Locations', data.stats.locations],
                    ['Relations', data.stats.reporting_lines],
                    ['App Roles', data.stats.app_roles],
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
                {canAccess('users_locations') && <TabButton active={activeTab === 'users'} icon={<UsersRound size={16} />} label="Users & Locations" onClick={() => setActiveTab('users')} />}
                {canAccess('users_locations') && <TabButton active={activeTab === 'appRoles'} icon={<UserCog size={16} />} label="App Roles" onClick={() => setActiveTab('appRoles')} />}
                {canAccess('reporting_lines') && <TabButton active={activeTab === 'hierarchy'} icon={<GitBranch size={16} />} label="Reporting Lines" onClick={() => setActiveTab('hierarchy')} />}
                <TabButton active={activeTab === 'guides'} icon={<BookOpenCheck size={16} />} label="Crew Guides" onClick={() => setActiveTab('guides')} />
                {canAccess('locations') && <TabButton active={activeTab === 'locations'} icon={<MapPinned size={16} />} label="Location Master" onClick={() => setActiveTab('locations')} />}
                {canAccess('regionals') && <TabButton active={activeTab === 'regionals'} icon={<MapPinned size={16} />} label="Regional Master" onClick={() => setActiveTab('regionals')} />}
                {canAccess('evaluation_masters') && <TabButton active={activeTab === 'evaluations'} icon={<ShieldCheck size={16} />} label="Evaluation Master" onClick={() => setActiveTab('evaluations')} />}
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
                            <h2 className="font-black text-gray-900 whitespace-nowrap">User Master</h2>
                            <div className="w-64">
                                <CustomSelect
                                    value={storeFilter}
                                    placeholder="Filter Store"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setStoreFilter(value); setUsersPage(1); }}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 max-w-md relative">
                                <input 
                                    type="text" 
                                    placeholder="Search name or NIK..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={usersSearch}
                                    onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }}
                                />
                            </div>
                            <button onClick={() => { resetUserForm(); setIsUserFormOpen(true); }} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 flex items-center gap-2 whitespace-nowrap">
                                <UserPlus size={16} />
                                New User
                            </button>
                            {isAdminRole && (
                                <button onClick={resetRoleForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">
                                    Add Account Role
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
                            {usersData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No users found.</div>
                            ) : usersData.map((user) => (
                                <button key={user.username} onClick={() => { selectUser(user); setIsUserFormOpen(true); }} className={`w-full text-left px-6 py-4 hover:bg-purple-50 transition ${selectedUsername === user.username ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{user.name}</p>
                                            <p className="text-xs text-gray-400">{user.username} · {user.job_level_name || 'No role'}</p>
                                        </div>
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${user.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {user.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Locations: {user.locations.map((location) => location.initial).join(', ') || '-'} · Leader: {user.leader?.name || '-'} · Subordinates: {user.subordinates_count}
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
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">User Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedUsername ? 'Edit User' : 'Create User'}</h2>
                                </div>
                                <button type="button" onClick={closeUserForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                            </div>
                            <Field label="NIK / Username">
                                <input disabled={!!selectedUsername} value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="input" required />
                            </Field>
                            <Field label="Name">
                                <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="input" required />
                            </Field>
                            <Field label="Email">
                                <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="input" />
                            </Field>
                            <Field label="Initial Store">
                                <CustomSelect
                                    value={userForm.initial_store}
                                    placeholder="Choose initial store"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => setUserForm({ ...userForm, initial_store: value })}
                                />
                            </Field>
                            <Field label="Password">
                                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="input" placeholder={selectedUsername ? 'Leave blank to keep current password' : 'Default: password'} />
                            </Field>
                            <Field label="Account Role">
                                <CustomSelect
                                    value={userForm.role_id}
                                    placeholder="Choose account role"
                                    options={data.roles.map((role) => ({ value: String(role.id), label: role.name }))}
                                    onChange={(value) => setUserForm({ ...userForm, role_id: value })}
                                />
                            </Field>
                            <Field label="HR/Corporate Job Level">
                                <CustomSelect
                                    value={userForm.job_level_id}
                                    placeholder="Choose HR job level"
                                    options={data.job_levels.map((level) => ({ value: String(level.id), label: level.name }))}
                                    onChange={(value) => setUserForm({ ...userForm, job_level_id: value })}
                                />
                            </Field>
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} />
                                Active user
                            </label>
                            <div>
                                <p className="text-sm font-bold text-gray-700 mb-2">Locations</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {data.locations.map((location) => (
                                        <label key={location.initial} className={`text-xs rounded-xl px-3 py-2 border cursor-pointer ${userForm.location_ids.includes(location.initial) ? 'border-primary bg-purple-50 text-primary' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                                            <input type="checkbox" className="hidden" checked={userForm.location_ids.includes(location.initial)} onChange={() => toggleLocation(location.initial)} />
                                            {location.initial} · {location.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                                {saving ? 'Saving...' : 'Save User'}
                            </button>
                        </form>
                    )}

                    {isRoleFormOpen && (
                        <form onSubmit={saveRole} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Account Role Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{roleForm.id ? 'Edit Account Role' : 'Create Account Role'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {roleForm.id && !['admin', 'user'].includes(roleForm.name.toLowerCase()) && (
                                        <button type="button" onClick={() => deleteRole(roleForm.id)} className="text-sm font-bold text-red-500">Delete</button>
                                    )}
                                    <button type="button" onClick={closeRoleForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                            <Field label="Role Name">
                                <input
                                    value={roleForm.name}
                                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                                    className="input"
                                    disabled={['admin', 'user'].includes(roleForm.name.toLowerCase())}
                                    required
                                />
                            </Field>
                            <Field label="Description">
                                <input
                                    value={roleForm.description}
                                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                                    className="input"
                                    placeholder="Short role description"
                                />
                            </Field>
                            <div>
                                <p className="text-sm font-bold text-gray-700 mb-3">Permission</p>
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
                                <p className="text-sm font-black text-gray-800 mb-3">Existing Account Roles</p>
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
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-primary">{role.users_count || 0} user(s)</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{role.description || '-'}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button disabled={saving} className="bg-primary text-white rounded-xl py-3 px-8 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 self-start">
                                {saving ? 'Saving...' : 'Submit'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {activeTab === 'appRoles' && (
                <div className={`grid gap-6 transition-all duration-300 ${isAppRoleFormOpen ? 'grid-cols-[1.2fr_0.8fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-black text-gray-900">Application Role by Location</h2>
                            </div>
                            <div className="w-64">
                                <CustomSelect
                                    value={storeFilter}
                                    placeholder="Filter Store"
                                    options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                    onChange={(value) => { setStoreFilter(value); setUserLocationsPage(1); }}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Search user or location..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={userLocationsSearch}
                                    onChange={(e) => { setUserLocationsSearch(e.target.value); setUserLocationsPage(1); }}
                                />
                            </div>
                            <button onClick={resetAppRoleForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">
                                Add App Role
                            </button>
                            <button disabled={saving} onClick={syncUserLocations} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50 whitespace-nowrap">
                                Sync From Users
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                            {userLocationsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No assignments found.</div>
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
                                        placeholder="Choose app role"
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
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">App Role Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{appRoleForm.id ? 'Edit App Role' : 'Create App Role'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {appRoleForm.id && (
                                        <button type="button" onClick={() => deleteAppRole(appRoleForm.id)} className="text-sm font-bold text-red-500">Delete</button>
                                    )}
                                    <button type="button" onClick={closeAppRoleForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                            <Field label="Role Name">
                                <input
                                    value={appRoleForm.name}
                                    onChange={(e) => setAppRoleForm({ ...appRoleForm, name: e.target.value })}
                                    className="input"
                                    required
                                />
                            </Field>

                            <Field label="Description">
                                <input
                                    value={appRoleForm.description}
                                    onChange={(e) => setAppRoleForm({ ...appRoleForm, description: e.target.value })}
                                    className="input"
                                    placeholder="Short role description"
                                />
                            </Field>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={appRoleForm.active}
                                        onChange={(e) => setAppRoleForm({ ...appRoleForm, active: e.target.checked })}
                                    />
                                    Active app role
                                </label>
                            </div>

                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-sm font-black text-gray-800 mb-3">Available App Roles</p>
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
                                                    {role.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{role.description || '-'} · {role.users_count || 0} assignment(s)</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button disabled={saving} className="bg-primary text-white rounded-xl py-3 px-8 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 self-start">
                                {saving ? 'Saving...' : 'Submit'}
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
                            <h2 className="text-xl font-black text-gray-900">Assign Leader</h2>
                        </div>
                        <Field label="Filter Store">
                            <CustomSelect
                                value={storeFilter}
                                placeholder="Filter Store"
                                options={data.locations.map((location) => ({ value: location.initial, label: `${location.initial} - ${location.name}` }))}
                                onChange={(value) => { setStoreFilter(value); setSelectedLeaderId(''); setUsersPage(1); }}
                                searchable
                            />
                        </Field>
                        <Field label="Leader">
                            <CustomSelect
                                value={lineForm.leader_id}
                                placeholder="Choose leader"
                                options={leadersData.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                onChange={(value) => setLineForm({ ...lineForm, leader_id: value })}
                                searchable
                            />
                        </Field>
                        <Field label="Subordinate">
                            <CustomSelect
                                value={lineForm.subordinate_id}
                                placeholder="Choose subordinate"
                                options={usersData.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                onChange={(value) => setLineForm({ ...lineForm, subordinate_id: value })}
                                searchable
                            />
                        </Field>
                        <Field label="Status">
                            <CustomSelect
                                value={lineForm.status}
                                placeholder="Choose status"
                                options={[
                                    { value: 'active', label: 'active' },
                                    { value: 'inactive', label: 'inactive' },
                                ]}
                                onChange={(value) => setLineForm({ ...lineForm, status: value as 'active' | 'inactive' })}
                            />
                        </Field>
                        <p className="text-xs text-gray-400 mt-2">Note: To find subordinates, please make sure to use the Users search first if they are not on the first page.</p>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            Save Relation
                        </button>
                    </form>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-4">
                            <div className="flex-1">
                                <h2 className="font-black text-gray-900 mb-2">Filter Subordinates by Leader</h2>
                                <CustomSelect
                                    value={selectedLeaderId}
                                    placeholder="Select a leader to view their reporting lines..."
                                    options={leadersData.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                    onChange={(value) => setSelectedLeaderId(value)}
                                    searchable
                                />
                            </div>
                            <div className="flex-1 self-end relative">
                                <input 
                                    type="text" 
                                    placeholder="Search subordinate..." 
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={hierarchySearch}
                                    onChange={(e) => setHierarchySearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {!selectedLeaderId ? (
                                <div className="p-8 text-center text-gray-400 text-sm">Please select a leader above to view their subordinates.</div>
                            ) : reportingLinesData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No subordinates found for this leader.</div>
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
                                        <button onClick={() => deleteReportingLine(line.id)} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl">Delete</button>
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
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Work Stations</h2>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Search station..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={guidesSearch}
                                    onChange={(e) => setGuidesSearch(e.target.value)}
                                />
                            </div>
                            <button onClick={() => { setGuideForm({ id: '', name: '', guideText: '' }); setIsGuideFormOpen(true); }} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">New Guide</button>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {data.work_stations.filter(station => station.name.toLowerCase().includes(guidesSearch.toLowerCase())).map((station) => (
                                <button key={station.id} onClick={() => selectGuide(station)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${guideForm.id === String(station.id) ? 'bg-purple-50' : ''}`}>
                                    <p className="font-black text-gray-900 capitalize">{station.name}</p>
                                    <p className="text-xs text-gray-400">{station.guide_content.length} guide item(s)</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isGuideFormOpen && (
                        <form onSubmit={saveGuide} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Crew Guide</p>
                                    <h2 className="text-xl font-black text-gray-900">{guideForm.id ? 'Edit Guide' : 'Create Station Guide'}</h2>
                                </div>
                                <button type="button" onClick={closeGuideForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                            </div>
                        <Field label="Station Name">
                            <input value={guideForm.name} onChange={(e) => setGuideForm({ ...guideForm, name: e.target.value })} className="input" required />
                        </Field>
                        <Field label="Guide Content">
                            <textarea
                                value={guideForm.guideText}
                                onChange={(e) => setGuideForm({ ...guideForm, guideText: e.target.value })}
                                className="input min-h-[320px]"
                                placeholder="One guide item per line"
                            />
                        </Field>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50 flex items-center justify-center gap-2">
                            <Save size={16} />
                            {saving ? 'Saving...' : 'Save Guide'}
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
                                <h2 className="font-black text-gray-900">Evaluation Master</h2>
                                <p className="text-xs text-gray-400">Manage monthly evaluation questions.</p>
                            </div>
                            <button onClick={resetEvaluationForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">New Evaluation</button>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {data.evaluation_masters.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No evaluation item found.</div>
                            ) : data.evaluation_masters.map((item) => (
                                <button key={item.id} onClick={() => selectEvaluation(item)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 transition ${evaluationForm.id === String(item.id) ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{item.question}</p>
                                            <p className="text-xs text-gray-400">{item.title} - {item.subtitle}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${item.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {item.active ? 'Active' : 'Inactive'}
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
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Evaluation Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{evaluationForm.id ? 'Edit Evaluation' : 'Create Evaluation'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {evaluationForm.id && (
                                        <button type="button" onClick={() => deleteEvaluationMaster(evaluationForm.id)} className="text-sm font-bold text-red-500">Delete</button>
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
                                    <Field label="Question">
                                        <input value={evaluationForm.question} onChange={(e) => setEvaluationForm({ ...evaluationForm, question: e.target.value })} className="input" required />
                                    </Field>
                                    {evaluationForm.answers.map((answer, index) => (
                                        <Field key={index} label={`Answer ${index + 1}`}>
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
                                        </Field>
                                    ))}
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Sort Order">
                                            <input type="number" value={evaluationForm.sort_order} onChange={(e) => setEvaluationForm({ ...evaluationForm, sort_order: e.target.value })} className="input" />
                                        </Field>
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 pt-7">
                                            <input type="checkbox" checked={evaluationForm.active} onChange={(e) => setEvaluationForm({ ...evaluationForm, active: e.target.checked })} />
                                            Active
                                        </label>
                                    </div>
                                    <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                                        {saving ? 'Saving...' : 'Save Evaluation'}
                                    </button>
                                </div>

                                <div className="bg-gray-50 rounded-3xl border border-gray-100 p-6">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Preview Evaluation</p>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">{evaluationForm.title || 'MONTHLY EVALUATION'}</h2>
                                    <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">{evaluationForm.subtitle || 'SIKAP KEPRIBADIAN'}</p>
                                    <div>
                                        <h3 className="font-semibold text-gray-700 mb-1">{evaluationForm.question || 'Question title'}</h3>
                                        <div className="text-xs text-gray-500 mb-3 leading-relaxed space-y-1">
                                            {evaluationForm.answers.map((answer, index) => (
                                                <p key={index}>{index + 1}. {answer || `Answer ${index + 1}`}</p>
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
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Location Master</h2>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Search location..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={locationsSearch}
                                    onChange={(e) => { setLocationsSearch(e.target.value); setLocationsPage(1); }}
                                />
                            </div>
                            <button onClick={resetLocationForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">New Location</button>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {locationsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No locations found.</div>
                            ) : locationsData.map((location) => (
                                <button key={location.initial} onClick={() => selectLocation(location)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 transition ${selectedLocationInitial === location.initial ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-gray-900">{location.name}</p>
                                            <p className="text-xs text-gray-400">{location.initial} · Store {location.store_code || '-'} · {location.city || '-'}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${Boolean(location.is_active ?? true) ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                            {Boolean(location.is_active ?? true) ? 'Active' : 'Inactive'}
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
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Location Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedLocationInitial ? 'Edit Location' : 'Create Location'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedLocationInitial && (
                                        <button type="button" onClick={() => deleteLocation(selectedLocationInitial)} className="text-sm font-bold text-red-500">Delete</button>
                                    )}
                                    <button type="button" onClick={closeLocationForm} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={20} /></button>
                                </div>
                            </div>
                        <Field label="Initial">
                            <input disabled={!!selectedLocationInitial} value={locationForm.initial} onChange={(e) => setLocationForm({ ...locationForm, initial: e.target.value.toUpperCase() })} className="input" required />
                        </Field>
                        <Field label="Name">
                            <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} className="input" required />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Store Code">
                                <input type="number" value={locationForm.store_code} onChange={(e) => setLocationForm({ ...locationForm, store_code: e.target.value })} className="input" />
                            </Field>
                            <Field label="Region Code">
                                <input type="number" value={locationForm.region_code} onChange={(e) => setLocationForm({ ...locationForm, region_code: e.target.value })} className="input" />
                            </Field>
                        </div>
                        <Field label="City">
                            <input value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} className="input" />
                        </Field>
                        <Field label="Address">
                            <input value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} className="input" />
                        </Field>
                        <Field label="Phone">
                            <input value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} className="input" />
                        </Field>
                        <Field label="Store Type">
                            <input value={locationForm.type_store} onChange={(e) => setLocationForm({ ...locationForm, type_store: e.target.value })} className="input" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <input type="checkbox" checked={locationForm.is_active} onChange={(e) => setLocationForm({ ...locationForm, is_active: e.target.checked })} />
                            Active location
                        </label>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Location'}
                        </button>
                    </form>
                    )}
                </div>
            )}

            {activeTab === 'regionals' && (
                <div className={`grid gap-6 transition-all duration-300 ${isRegionalFormOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                            <h2 className="font-black text-gray-900 whitespace-nowrap">Regional Master</h2>
                            <div className="flex-1 max-w-sm relative">
                                <input 
                                    type="text" 
                                    placeholder="Search regional..." 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={regionalsSearch}
                                    onChange={(e) => { setRegionalsSearch(e.target.value); setRegionalsPage(1); }}
                                />
                            </div>
                            <button onClick={resetRegionalForm} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 whitespace-nowrap">New Regional</button>
                        </div>
                        <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[620px]">
                            {regionalsData.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No regionals found.</div>
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
                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Regional Data</p>
                                    <h2 className="text-xl font-black text-gray-900">{selectedRegionalId ? 'Edit Regional' : 'Create Regional'}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {selectedRegionalId && (
                                        <button type="button" onClick={() => deleteRegional(selectedRegionalId)} className="text-sm font-bold text-red-500">Delete</button>
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
                            <input value={regionalForm.cabang} onChange={(e) => setRegionalForm({ ...regionalForm, cabang: e.target.value })} className="input" placeholder="Initial store or branch note" />
                        </Field>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Regional'}
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
                    Previous
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
                    Next
                </button>
            </div>

            <form onSubmit={submitJump} className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">Page {safePage} of {safeTotal}</span>
                <input
                    type="number"
                    min={1}
                    max={safeTotal}
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value)}
                    placeholder="Go to"
                    className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-purple-100"
                />
                <button className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:text-primary hover:border-primary transition">
                    Go
                </button>
            </form>
        </div>
    );
}

function CustomSelect({ value, placeholder, options, onChange, searchable }: { value: string; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; searchable?: boolean }) {
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
                <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl flex flex-col">
                    {searchable && (
                        <div className="p-2 sticky top-0 bg-white z-10 border-b border-gray-100">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search..."
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
                        <div className="px-3 py-4 text-center text-xs text-gray-400">No matching options</div>
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
