import React, { useEffect, useState } from 'react';
import { BookOpenCheck, GitBranch, MapPinned, RefreshCcw, Save, ShieldCheck, UserCog, UserPlus, UsersRound } from 'lucide-react';

type Tab = 'users' | 'appRoles' | 'hierarchy' | 'guides' | 'locations' | 'regionals' | 'roles';

type JobLevel = {
    id: number;
    name: string;
    description?: string;
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
    job_level_id: number;
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

type CmsData = {
    stats: Record<string, number>;
    users: CmsUser[];
    job_levels: JobLevel[];
    locations: Location[];
    reporting_lines: ReportingLine[];
    work_stations: WorkStation[];
    user_locations: UserLocationAssignment[];
    app_job_levels: string[];
    regionals: Regional[];
};

const emptyUserForm = {
    username: '',
    name: '',
    email: '',
    password: '',
    initial_store: '',
    job_level_id: '',
    active: true,
    location_ids: [] as string[],
};

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [data, setData] = useState<CmsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
    const [userForm, setUserForm] = useState(emptyUserForm);
    const [lineForm, setLineForm] = useState({ leader_id: '', subordinate_id: '', status: 'active' as 'active' | 'inactive' });
    const [guideForm, setGuideForm] = useState({ id: '', name: '', guideText: '' });
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
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [roleForm, setRoleForm] = useState({ name: '', description: '' });
    const [selectedRegionalId, setSelectedRegionalId] = useState<number | null>(null);
    const [regionalForm, setRegionalForm] = useState({ kode_regional: '', nama_regional: '', cabang: '' });

    useEffect(() => {
        fetchOverview();
    }, []);

    const fetchOverview = async () => {
        setLoading(true);
        setMessage('');
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/cms/overview', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load CMS data.');
            }

            const payload = await response.json();
            setData(payload);
        } catch (error: any) {
            setMessage(error.message || 'Failed to load CMS data.');
        } finally {
            setLoading(false);
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
            throw new Error(payload?.message || 'Request failed.');
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
            job_level_id: String(user.job_level_id),
            active: user.active,
            location_ids: user.locations.map((location) => location.initial),
        });
    };

    const resetUserForm = () => {
        setSelectedUsername(null);
        setUserForm(emptyUserForm);
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
                job_level_id: Number(userForm.job_level_id),
                password: userForm.password || undefined,
            };

            if (selectedUsername) {
                await requestJson(`/api/cms/users/${selectedUsername}`, 'PATCH', payload);
                setMessage('User updated.');
            } else {
                await requestJson('/api/cms/users', 'POST', payload);
                setMessage('User created.');
            }

            resetUserForm();
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

            setGuideForm({ id: '', name: '', guideText: '' });
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

            resetLocationForm();
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
            resetLocationForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete location.');
        } finally {
            setSaving(false);
        }
    };

    const selectRole = (role: JobLevel) => {
        setSelectedRoleId(role.id);
        setRoleForm({ name: role.name, description: role.description || '' });
    };

    const resetRoleForm = () => {
        setSelectedRoleId(null);
        setRoleForm({ name: '', description: '' });
    };

    const saveRole = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            if (selectedRoleId) {
                await requestJson(`/api/cms/job-levels/${selectedRoleId}`, 'PATCH', roleForm);
                setMessage('Role updated.');
            } else {
                await requestJson('/api/cms/job-levels', 'POST', roleForm);
                setMessage('Role created.');
            }

            resetRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to save role.');
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
            await fetchOverview();
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
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to synchronize user locations.');
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
    };

    const resetRegionalForm = () => {
        setSelectedRegionalId(null);
        setRegionalForm({ kode_regional: '', nama_regional: '', cabang: '' });
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

            resetRegionalForm();
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
            resetRegionalForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete regional.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRole = async (id: number) => {
        if (!window.confirm('Delete this role? Roles assigned to users cannot be deleted.')) return;

        setSaving(true);
        setMessage('');
        try {
            await requestJson(`/api/cms/job-levels/${id}`, 'DELETE');
            setMessage('Role deleted.');
            resetRoleForm();
            await fetchOverview();
        } catch (error: any) {
            setMessage(error.message || 'Failed to delete role.');
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

    const managersAndSupervisors = data.users.filter((user) => ['manager', 'supervisor', 'superadmin'].includes(user.role_type || ''));

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
                    ['App Roles', data.stats.user_locations],
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
                <TabButton active={activeTab === 'users'} icon={<UsersRound size={16} />} label="Users & Locations" onClick={() => setActiveTab('users')} />
                <TabButton active={activeTab === 'appRoles'} icon={<UserCog size={16} />} label="App Roles" onClick={() => setActiveTab('appRoles')} />
                <TabButton active={activeTab === 'hierarchy'} icon={<GitBranch size={16} />} label="Reporting Lines" onClick={() => setActiveTab('hierarchy')} />
                <TabButton active={activeTab === 'guides'} icon={<BookOpenCheck size={16} />} label="Crew Guides" onClick={() => setActiveTab('guides')} />
                <TabButton active={activeTab === 'locations'} icon={<MapPinned size={16} />} label="Location Master" onClick={() => setActiveTab('locations')} />
                <TabButton active={activeTab === 'regionals'} icon={<MapPinned size={16} />} label="Regional Master" onClick={() => setActiveTab('regionals')} />
                <TabButton active={activeTab === 'roles'} icon={<ShieldCheck size={16} />} label="HR Job Levels" onClick={() => setActiveTab('roles')} />
            </div>

            {activeTab === 'users' && (
                <div className="grid grid-cols-[1.2fr_0.8fr] gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-black text-gray-900">User Master</h2>
                            <button onClick={resetUserForm} className="text-sm text-primary font-bold flex items-center gap-2">
                                <UserPlus size={16} />
                                New User
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                            {data.users.map((user) => (
                                <button key={user.username} onClick={() => selectUser(user)} className={`w-full text-left px-6 py-4 hover:bg-purple-50 transition ${selectedUsername === user.username ? 'bg-purple-50' : ''}`}>
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
                    </div>

                    <form onSubmit={saveUser} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">User Editor</p>
                            <h2 className="text-xl font-black text-gray-900">{selectedUsername ? 'Edit User' : 'Create User'}</h2>
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
                </div>
            )}

            {activeTab === 'appRoles' && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h2 className="font-black text-gray-900">Application Role by Location</h2>
                            <p className="text-xs text-gray-400 mt-1">This controls YoDaily routing. HR job level remains separate.</p>
                        </div>
                        <button disabled={saving} onClick={syncUserLocations} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-50">
                            Sync From Users
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[680px] overflow-y-auto">
                        {data.user_locations.map((assignment) => (
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
                </div>
            )}

            {activeTab === 'hierarchy' && (
                <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                    <form onSubmit={saveReportingLine} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Hierarchy</p>
                            <h2 className="text-xl font-black text-gray-900">Assign Leader</h2>
                        </div>
                        <Field label="Leader">
                            <CustomSelect
                                value={lineForm.leader_id}
                                placeholder="Choose leader"
                                options={managersAndSupervisors.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                onChange={(value) => setLineForm({ ...lineForm, leader_id: value })}
                            />
                        </Field>
                        <Field label="Subordinate">
                            <CustomSelect
                                value={lineForm.subordinate_id}
                                placeholder="Choose subordinate"
                                options={data.users.map((user) => ({ value: user.username, label: `${user.name} (${user.role_type})` }))}
                                onChange={(value) => setLineForm({ ...lineForm, subordinate_id: value })}
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
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            Save Relation
                        </button>
                    </form>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="font-black text-gray-900">Current Reporting Lines</h2>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                            {data.reporting_lines.map((line) => (
                                <div key={line.id} className="px-6 py-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-black text-gray-900">{line.leader_name || line.leader_id}</p>
                                        <p className="text-xs text-gray-400">leads</p>
                                        <p className="font-bold text-gray-700">{line.subordinate_name || line.subordinate_id}</p>
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
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="font-black text-gray-900">Work Stations</h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {data.work_stations.map((station) => (
                                <button key={station.id} onClick={() => selectGuide(station)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${guideForm.id === String(station.id) ? 'bg-purple-50' : ''}`}>
                                    <p className="font-black text-gray-900 capitalize">{station.name}</p>
                                    <p className="text-xs text-gray-400">{station.guide_content.length} guide item(s)</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={saveGuide} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Crew Guide</p>
                                <h2 className="text-xl font-black text-gray-900">{guideForm.id ? 'Edit Guide' : 'Create Station Guide'}</h2>
                            </div>
                            <button type="button" onClick={() => setGuideForm({ id: '', name: '', guideText: '' })} className="text-sm text-primary font-bold">New Guide</button>
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
                </div>
            )}

            {activeTab === 'locations' && (
                <div className="grid grid-cols-[1fr_1fr] gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-black text-gray-900">Location Master</h2>
                            <button onClick={resetLocationForm} className="text-sm text-primary font-bold">New Location</button>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                            {data.locations.map((location) => (
                                <button key={location.initial} onClick={() => selectLocation(location)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${selectedLocationInitial === location.initial ? 'bg-purple-50' : ''}`}>
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
                    </div>

                    <form onSubmit={saveLocation} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Store Data</p>
                                <h2 className="text-xl font-black text-gray-900">{selectedLocationInitial ? 'Edit Location' : 'Create Location'}</h2>
                            </div>
                            {selectedLocationInitial && (
                                <button type="button" onClick={() => deleteLocation(selectedLocationInitial)} className="text-sm font-bold text-red-500">Delete</button>
                            )}
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
                </div>
            )}

            {activeTab === 'regionals' && (
                <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-black text-gray-900">Regional Master</h2>
                            <button onClick={resetRegionalForm} className="text-sm text-primary font-bold">New Regional</button>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
                            {data.regionals.map((regional) => (
                                <button key={regional.id} onClick={() => selectRegional(regional)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${selectedRegionalId === regional.id ? 'bg-purple-50' : ''}`}>
                                    <p className="font-black text-gray-900">{regional.nama_regional}</p>
                                    <p className="text-xs text-gray-400">{regional.kode_regional} - Cabang: {regional.cabang || '-'}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={saveRegional} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">Regional Data</p>
                                <h2 className="text-xl font-black text-gray-900">{selectedRegionalId ? 'Edit Regional' : 'Create Regional'}</h2>
                            </div>
                            {selectedRegionalId && (
                                <button type="button" onClick={() => deleteRegional(selectedRegionalId)} className="text-sm font-bold text-red-500">Delete</button>
                            )}
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
                </div>
            )}

            {activeTab === 'roles' && (
                <div className="grid grid-cols-[0.9fr_1.1fr] gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-black text-gray-900">HR Job Level Master</h2>
                            <button onClick={resetRoleForm} className="text-sm text-primary font-bold">New Job Level</button>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {data.job_levels.map((role) => (
                                <button key={role.id} onClick={() => selectRole(role)} className={`w-full px-6 py-4 text-left hover:bg-purple-50 ${selectedRoleId === role.id ? 'bg-purple-50' : ''}`}>
                                    <p className="font-black text-gray-900">{role.name}</p>
                                    <p className="text-xs text-gray-400">{role.description || 'No description'}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={saveRole} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold">HR Job Level Data</p>
                                <h2 className="text-xl font-black text-gray-900">{selectedRoleId ? 'Edit HR Job Level' : 'Create HR Job Level'}</h2>
                            </div>
                            {selectedRoleId && (
                                <button type="button" onClick={() => deleteRole(selectedRoleId)} className="text-sm font-bold text-red-500">Delete</button>
                            )}
                        </div>
                        <Field label="HR Job Level Name">
                            <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="input" required />
                        </Field>
                        <Field label="Description">
                            <textarea value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className="input min-h-[180px]" />
                        </Field>
                        <div className="rounded-2xl bg-yellow-50 border border-yellow-100 p-4 text-xs text-yellow-700">
                            HR job levels are company data. YoDaily access is controlled from App Roles on user-location assignments.
                        </div>
                        <button disabled={saving} className="w-full bg-primary text-white rounded-xl py-3 font-bold shadow-lg shadow-purple-100 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Role'}
                        </button>
                    </form>
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

function CustomSelect({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.value === value);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="input flex items-center justify-between text-left"
            >
                <span className={selected ? 'text-gray-800' : 'text-gray-400'}>{selected?.label || placeholder}</span>
                <span className="text-gray-400">⌄</span>
            </button>
            {open && (
                <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
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
                    {options.map((option) => (
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
