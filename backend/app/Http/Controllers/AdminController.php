<?php

namespace App\Http\Controllers;

use App\Models\JobLevel;
use App\Models\AppRole;
use App\Models\EvaluationMaster;
use App\Models\ActivityLog;
use App\Models\GuideRead;
use App\Models\Location;
use App\Models\Regional;
use App\Models\ReportingLine;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\UserLocation;
use App\Models\WorkStation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private const DEFAULT_APP_JOB_LEVELS = ['sc', 'supervisor', 'manager', 'regional_manager'];
    private const CMS_PERMISSIONS = [
        'users_locations' => 'User & Location',
        'reporting_lines' => 'Reporting Lines',
        'locations' => 'Location',
        'regionals' => 'Region Master',
        'evaluation_masters' => 'Evaluation Master',
    ];

    public function overview()
    {
        $this->authorizeSuperadmin();

        $workStations = WorkStation::orderBy('name')->get()->map(fn(WorkStation $station) => [
            'id' => $station->id,
            'name' => $station->name,
            'guide_content' => $station->guide_content ?: [],
            'active' => (bool) $station->active,
        ]);

        return response()->json([
            'stats' => [
                'users' => User::count(),
                'active_users' => User::where('active', true)->count(),
                'locations' => Location::count(),
                'reporting_lines' => ReportingLine::where('status', 'active')->count(),
                'work_stations' => $workStations->count(),
                'user_locations' => UserLocation::count(),
                'regionals' => Regional::count(),
                'account_roles' => Role::count(),
                'app_roles' => AppRole::count(),
                'evaluation_masters' => EvaluationMaster::count(),
            ],
            'roles' => Role::orderBy('name')->get()->map(fn(Role $role) => $this->formatRole($role)),
            'cms_permissions' => collect(self::CMS_PERMISSIONS)->map(fn($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'current_account_role' => Auth::user()?->accountRole?->name,
            'current_permissions' => Auth::user()?->accountRole?->permissions ?: [],
            'job_levels' => JobLevel::orderBy('name')->get(['id', 'name', 'description']),
            'locations' => Location::orderBy('name')->get([
                'initial',
                'name',
                'store_code',
                'address',
                'city',
                'phone',
                'region_code',
                'is_active',
                'type_store',
            ]),
            'work_stations' => $workStations,
            'app_roles' => AppRole::orderBy('name')->get()->map(fn(AppRole $role) => $this->formatAppRole($role)),
            'app_job_levels' => $this->appJobLevelNames(),
            'regionals' => Regional::orderBy('kode_regional')->get(),
            'evaluation_masters' => EvaluationMaster::orderBy('sort_order')->orderBy('id')->get()->map(fn(EvaluationMaster $master) => $this->formatEvaluationMaster($master)),
        ]);
    }

    public function getUsers(Request $request)
    {
        $this->authorizePermission('users_locations');

        $query = User::without(['jobLevel', 'locations', 'userLocations'])
            ->with([
                'accountRole:id,name,description,permissions',
                'jobLevel:id,name',
                'locations:initial,name',
                'userLocations:user_id,job_level',
                'leaderLines' => fn($q) => $q
                    ->where('status', 'active')
                    ->with('leader:username,name')
                    ->select(['id', 'leader_id', 'subordinate_id', 'status']),
            ])
            ->withCount('subordinateLines')
            ->orderBy('name');

        if ($request->has('search') && $request->search !== '') {
            $searchTerm = '%' . strtolower($request->search) . '%';
            $query->where(function ($q) use ($searchTerm) {
                $q->whereRaw('LOWER(name) like ?', [$searchTerm])
                  ->orWhereRaw('LOWER(username) like ?', [$searchTerm]);
            });
        }

        if ($request->filled('store')) {
            $query->whereHas('locations', fn($q) => $q->where('locations.initial', $request->query('store')));
        }

        $paginator = $query->paginate(50);
        
        $paginator->getCollection()->transform(function (User $user) {
            return $this->formatUser($user);
        });

        return response()->json($paginator);
    }

    public function getUserLocations(Request $request)
    {
        $this->authorizePermission('users_locations');

        $query = UserLocation::with(['user', 'location']);

        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->whereHas('user', function ($userQuery) use ($search) {
                    $userQuery->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                        ->orWhereRaw('LOWER(username) like ?', ["%{$search}%"]);
                })->orWhereHas('location', function ($locationQuery) use ($search) {
                    $locationQuery->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                        ->orWhereRaw('LOWER(initial) like ?', ["%{$search}%"]);
                });
            });
        }

        if ($request->filled('store')) {
            $query->where('location_id', $request->query('store'));
        }

        $paginator = $query->orderBy('user_id')
            ->orderBy('location_id')
            ->paginate(50);

        $paginator->getCollection()->transform(function (UserLocation $assignment) {
            return $this->formatUserLocation($assignment);
        });

        return response()->json($paginator);
    }

    public function getLeaders(Request $request)
    {
        $this->authorizePermission('reporting_lines');
        
        $leaderRoles = $this->appJobLevelNames()->reject(fn($role) => $role === 'sc')->values();
        $leaderUsernames = UserLocation::whereIn('job_level', $leaderRoles)->pluck('user_id');
        
        $leaders = User::where(function ($query) use ($leaderUsernames) {
            $query->whereIn('username', $leaderUsernames)
                ->orWhereHas('accountRole', function($q) {
                    $q->where('name', 'admin');
                });
            });

        if ($request->filled('store')) {
            $leaders->whereHas('locations', fn($q) => $q->where('locations.initial', $request->query('store')));
        }

        $leaders = $leaders
            ->orderBy('name')
            ->get(['username', 'name']);
            
        $leadersArray = $leaders->map(function(User $u) {
            return [
                'username' => $u->username,
                'name' => $u->name,
                'role_type' => $u->role_type
            ];
        });

        return response()->json($leadersArray);
    }

    public function getReportingLines(Request $request)
    {
        $this->authorizePermission('reporting_lines');
        
        $query = ReportingLine::with(['leader.jobLevel', 'subordinate.jobLevel'])
            ->orderBy('leader_id')
            ->orderBy('subordinate_id');
            
        if ($request->has('leader_id') && $request->leader_id !== '') {
            $query->where('leader_id', $request->leader_id);
        }

        if ($request->filled('store')) {
            $store = $request->query('store');
            $query->where(function ($q) use ($store) {
                $q->whereHas('leader.locations', fn($locationQuery) => $locationQuery->where('locations.initial', $store))
                    ->orWhereHas('subordinate.locations', fn($locationQuery) => $locationQuery->where('locations.initial', $store));
            });
        }

        $lines = $query->get()->map(function (ReportingLine $line) {
            return $this->formatReportingLine($line);
        });

        return response()->json($lines);
    }

    public function getLocations(Request $request)
    {
        $this->authorizePermission('locations');

        $query = Location::orderBy('name');

        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(initial) like ?', ["%{$search}%"])
                    ->orWhereRaw('CAST(store_code AS TEXT) like ?', ["%{$search}%"]);
            });
        }

        return response()->json($query->paginate(50));
    }

    public function getRegionals(Request $request)
    {
        $this->authorizePermission('regionals');

        $query = Regional::orderBy('kode_regional');

        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(nama_regional) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(kode_regional) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(COALESCE(cabang, \'\')) like ?', ["%{$search}%"]);
            });
        }

        return response()->json($query->paginate(50));
    }

    public function storeUser(Request $request)
    {
        $this->authorizePermission('users_locations');

        $data = $request->validate([
            'username' => ['required', 'string', 'max:255', 'unique:users,username'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'password' => ['nullable', 'string', 'min:6'],
            'job_level_id' => ['required', 'exists:job_levels,id'],
            'role_id' => ['nullable', 'exists:roles,id'],
            'active' => ['boolean'],
            'initial_store' => ['nullable', 'exists:locations,initial'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $user = User::create([
            'username' => $data['username'],
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'password' => Hash::make($data['password'] ?? 'password'),
            'job_level_id' => $data['job_level_id'],
            'role_id' => $data['role_id'] ?? $this->defaultAccountRoleId(),
            'initial_store' => $data['initial_store'] ?? null,
            'active' => $data['active'] ?? true,
        ]);

        $this->syncUserLocations($user, $data['location_ids'] ?? []);

        return response()->json($this->formatUser($user->fresh(['jobLevel', 'locations'])), 201);
    }

    public function storeLocation(Request $request)
    {
        $this->authorizePermission('locations');

        $data = $request->validate([
            'initial' => ['required', 'string', 'max:255', 'unique:locations,initial'],
            'name' => ['required', 'string', 'max:255'],
            'store_code' => ['nullable', 'integer', 'unique:locations,store_code'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'region_code' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
            'type_store' => ['nullable', 'string', 'max:255'],
        ]);

        $location = Location::create([
            ...$data,
            'is_active' => $data['is_active'] ?? 1,
        ]);

        return response()->json($location, 201);
    }

    public function updateLocation(Request $request, string $initial)
    {
        $this->authorizePermission('locations');

        $location = Location::where('initial', $initial)->firstOrFail();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'store_code' => ['nullable', 'integer', Rule::unique('locations', 'store_code')->ignore($location->id)],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'region_code' => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
            'type_store' => ['nullable', 'string', 'max:255'],
        ]);

        $location->update([
            ...$data,
            'is_active' => $data['is_active'] ?? 0,
        ]);

        return response()->json($location->fresh());
    }

    public function destroyLocation(string $initial)
    {
        $this->authorizePermission('locations');

        $location = Location::where('initial', $initial)->firstOrFail();
        if (UserLocation::where('location_id', $location->initial)->exists()) {
            throw ValidationException::withMessages([
                'location' => ['This location is still assigned to one or more users. Deactivate it instead.'],
            ]);
        }

        $location->delete();

        return response()->json(['message' => 'Location deleted.']);
    }



    public function updateUser(Request $request, string $username)
    {
        $this->authorizePermission('users_locations');

        $user = User::where('username', $username)->firstOrFail();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:6'],
            'job_level_id' => ['required', 'exists:job_levels,id'],
            'role_id' => ['nullable', 'exists:roles,id'],
            'active' => ['boolean'],
            'initial_store' => ['nullable', 'exists:locations,initial'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'job_level_id' => $data['job_level_id'],
            'role_id' => $data['role_id'] ?? $this->defaultAccountRoleId(),
            'initial_store' => $data['initial_store'] ?? null,
            'active' => $data['active'] ?? false,
        ]);

        if (!empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }

        $user->save();
        $this->syncUserLocations($user, $data['location_ids'] ?? []);

        return response()->json($this->formatUser($user->fresh(['jobLevel', 'locations'])));
    }

    public function storeReportingLine(Request $request)
    {
        $this->authorizePermission('reporting_lines');

        $data = $request->validate([
            'leader_id' => ['required', 'exists:users,username', 'different:subordinate_id'],
            'subordinate_id' => ['required', 'exists:users,username'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);

        $this->validateReportingLineHierarchy($data['leader_id'], $data['subordinate_id']);

        $line = ReportingLine::updateOrCreate(
            ['subordinate_id' => $data['subordinate_id']],
            [
                'leader_id' => $data['leader_id'],
                'status' => $data['status'],
            ]
        );

        return response()->json($this->formatReportingLine($line->fresh(['leader', 'subordinate'])), 201);
    }

    public function updateReportingLine(Request $request, ReportingLine $reportingLine)
    {
        $this->authorizePermission('reporting_lines');

        $data = $request->validate([
            'leader_id' => ['required', 'exists:users,username', 'different:subordinate_id'],
            'subordinate_id' => ['required', 'exists:users,username'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);

        $this->validateReportingLineHierarchy($data['leader_id'], $data['subordinate_id']);

        $reportingLine->update($data);

        return response()->json($this->formatReportingLine($reportingLine->fresh(['leader', 'subordinate'])));
    }

    public function destroyReportingLine(ReportingLine $reportingLine)
    {
        $this->authorizePermission('reporting_lines');

        $reportingLine->delete();

        return response()->json(['message' => 'Reporting line deleted.']);
    }

    public function storeWorkStation(Request $request)
    {
        $this->authorizeSuperadmin();

        if ($request->has('name')) {
            $request->merge(['name' => strtolower(trim((string) $request->input('name')))]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:work_stations,name'],
            'guide_content' => ['array'],
            'guide_content.*' => ['string', 'max:1000'],
            'active' => ['boolean'],
        ]);

        $station = WorkStation::create([
            'name' => $data['name'],
            'guide_content' => array_values($data['guide_content'] ?? []),
            'active' => $data['active'] ?? true,
        ]);

        return response()->json($station, 201);
    }

    public function updateWorkStation(Request $request, WorkStation $workStation)
    {
        $this->authorizeSuperadmin();

        if ($request->has('name')) {
            $request->merge(['name' => strtolower(trim((string) $request->input('name')))]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('work_stations', 'name')->ignore($workStation->id)],
            'guide_content' => ['array'],
            'guide_content.*' => ['string', 'max:1000'],
            'active' => ['boolean'],
        ]);

        $workStation->update([
            'name' => $data['name'],
            'guide_content' => array_values($data['guide_content'] ?? []),
            'active' => $data['active'] ?? false,
        ]);

        return response()->json($workStation->fresh());
    }

    public function destroyWorkStation(WorkStation $workStation)
    {
        $this->authorizeSuperadmin();

        $hasHistory = Task::where('work_station_id', $workStation->id)->exists()
            || ActivityLog::where('work_station_id', $workStation->id)->exists()
            || GuideRead::where('work_station_id', $workStation->id)->exists();

        if ($hasHistory) {
            throw ValidationException::withMessages([
                'work_station' => ['This work station already has history. Deactivate it instead.'],
            ]);
        }

        $workStation->delete();

        return response()->json(['message' => 'Work station deleted.']);
    }

    public function updateUserLocation(Request $request, UserLocation $userLocation)
    {
        $this->authorizePermission('users_locations');

        $data = $request->validate([
            'job_level' => ['required', Rule::exists('app_roles', 'name')->where('active', true)],
        ]);

        $userLocation->update([
            'job_level' => strtolower(trim($data['job_level'])),
        ]);

        return response()->json($this->formatUserLocation($userLocation->fresh(['user', 'location'])));
    }

    public function storeUserLocation(Request $request)
    {
        $this->authorizePermission('users_locations');

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,username'],
            'location_id' => ['required', 'exists:locations,initial'],
            'job_level' => ['required', Rule::exists('app_roles', 'name')->where('active', true)],
        ]);

        $assignment = UserLocation::updateOrCreate(
            ['user_id' => $data['user_id'], 'location_id' => $data['location_id']],
            ['job_level' => strtolower(trim($data['job_level']))]
        );

        return response()->json($this->formatUserLocation($assignment->fresh(['user', 'location'])), $assignment->wasRecentlyCreated ? 201 : 200);
    }

    public function syncUserLocationsFromUsers()
    {
        $this->authorizePermission('users_locations');

        $created = DB::affectingStatement(<<<'SQL'
            INSERT INTO user_locations (user_id, location_id, job_level, created_at, updated_at)
            SELECT
                users.username,
                locations.initial,
                CASE
                    WHEN LOWER(TRIM(job_levels.name)) IN ('crew', 'employee', 'sc') THEN 'sc'
                    WHEN LOWER(TRIM(job_levels.name)) = 'supervisor' THEN 'supervisor'
                    WHEN LOWER(TRIM(job_levels.name)) = 'manager' THEN 'manager'
                    WHEN LOWER(TRIM(job_levels.name)) = 'regional_manager' THEN 'regional_manager'
                    ELSE NULL
                END AS job_level,
                NOW(),
                NOW()
            FROM users
            LEFT JOIN job_levels ON job_levels.id = users.job_level_id
            INNER JOIN locations ON UPPER(TRIM(locations.initial)) = UPPER(TRIM(users.initial_store))
            LEFT JOIN user_locations ON user_locations.user_id = users.username
                AND user_locations.location_id = locations.initial
            WHERE users.initial_store IS NOT NULL
                AND TRIM(users.initial_store) <> ''
                AND user_locations.id IS NULL
                AND CASE
                    WHEN LOWER(TRIM(job_levels.name)) IN ('crew', 'employee', 'sc') THEN 'sc'
                    WHEN LOWER(TRIM(job_levels.name)) = 'supervisor' THEN 'supervisor'
                    WHEN LOWER(TRIM(job_levels.name)) = 'manager' THEN 'manager'
                    WHEN LOWER(TRIM(job_levels.name)) = 'regional_manager' THEN 'regional_manager'
                    ELSE NULL
                END IS NOT NULL
        SQL);

        return response()->json(['message' => "{$created} user-location assignment(s) synchronized.", 'created' => $created]);
    }

    public function storeRegional(Request $request)
    {
        $this->authorizePermission('regionals');

        $data = $request->validate([
            'kode_regional' => ['required', 'string', 'max:255', 'unique:regional,kode_regional'],
            'nama_regional' => ['required', 'string', 'max:255'],
            'cabang' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json(Regional::create($data), 201);
    }

    public function updateRegional(Request $request, Regional $regional)
    {
        $this->authorizePermission('regionals');

        $data = $request->validate([
            'kode_regional' => ['required', 'string', 'max:255', Rule::unique('regional', 'kode_regional')->ignore($regional->id)],
            'nama_regional' => ['required', 'string', 'max:255'],
            'cabang' => ['nullable', 'string', 'max:255'],
        ]);

        $regional->update($data);

        return response()->json($regional->fresh());
    }

    public function destroyRegional(Regional $regional)
    {
        $this->authorizePermission('regionals');
        $regional->delete();

        return response()->json(['message' => 'Regional deleted.']);
    }

    public function activeEvaluationMaster()
    {
        $masters = EvaluationMaster::where('active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn(EvaluationMaster $master) => $this->formatEvaluationMaster($master));

        return response()->json([
            'title' => $masters->first()['title'] ?? 'MONTHLY EVALUATION',
            'subtitle' => $masters->first()['subtitle'] ?? 'SIKAP KEPRIBADIAN',
            'criteria' => $masters,
        ]);
    }

    public function storeEvaluationMaster(Request $request)
    {
        $this->authorizePermission('evaluation_masters');

        $master = EvaluationMaster::create($this->validatedEvaluationMaster($request));

        return response()->json($this->formatEvaluationMaster($master), 201);
    }

    public function updateEvaluationMaster(Request $request, EvaluationMaster $evaluationMaster)
    {
        $this->authorizePermission('evaluation_masters');

        $evaluationMaster->update($this->validatedEvaluationMaster($request));

        return response()->json($this->formatEvaluationMaster($evaluationMaster->fresh()));
    }

    public function destroyEvaluationMaster(EvaluationMaster $evaluationMaster)
    {
        $this->authorizePermission('evaluation_masters');

        $evaluationMaster->delete();

        return response()->json(['message' => 'Evaluation item deleted.']);
    }

    public function storeAppRole(Request $request)
    {
        $this->authorizeRoleManagement();

        $role = AppRole::create($this->validatedAppRole($request));

        return response()->json($this->formatAppRole($role), 201);
    }

    public function updateAppRole(Request $request, AppRole $appRole)
    {
        $this->authorizeRoleManagement();

        $appRole->update($this->validatedAppRole($request, $appRole));

        return response()->json($this->formatAppRole($appRole->fresh()));
    }

    public function destroyAppRole(AppRole $appRole)
    {
        $this->authorizeRoleManagement();

        if (UserLocation::where('job_level', $appRole->name)->exists()) {
            throw ValidationException::withMessages([
                'app_role' => ['This app role is still assigned to one or more users. Move those users first.'],
            ]);
        }

        $appRole->delete();

        return response()->json(['message' => 'App role deleted.']);
    }

    public function storeRole(Request $request)
    {
        $this->authorizeRoleManagement();

        $data = $this->validatedRole($request);
        $data['name'] = strtolower(trim($data['name']));
        if ($data['name'] === 'admin') {
            $data['permissions'] = array_keys(self::CMS_PERMISSIONS + ['role_management' => 'Role Management']);
        }

        $role = Role::create($data);

        return response()->json($this->formatRole($role), 201);
    }

    public function updateRole(Request $request, Role $role)
    {
        $this->authorizeRoleManagement();

        $data = $this->validatedRole($request, $role);
        $data['name'] = strtolower(trim($data['name']));
        if ($data['name'] === 'admin') {
            $data['permissions'] = array_keys(self::CMS_PERMISSIONS + ['role_management' => 'Role Management']);
        }

        $role->update($data);

        return response()->json($this->formatRole($role->fresh()));
    }

    public function destroyRole(Role $role)
    {
        $this->authorizeRoleManagement();

        if (in_array(strtolower($role->name), ['admin', 'user'], true)) {
            throw ValidationException::withMessages([
                'role' => ['Default roles cannot be deleted.'],
            ]);
        }

        if ($role->users()->exists()) {
            throw ValidationException::withMessages([
                'role' => ['This role is still assigned to one or more users. Move those users first.'],
            ]);
        }

        $role->delete();

        return response()->json(['message' => 'Role deleted.']);
    }

    private function authorizeSuperadmin(): void
    {
        abort_if(Auth::user()?->role_type !== 'superadmin', 403, 'Unauthorized');
    }

    private function authorizePermission(string $permission): void
    {
        $this->authorizeSuperadmin();

        abort_if(!Auth::user()?->accountRole?->hasPermission($permission), 403, 'Unauthorized');
    }

    private function authorizeRoleManagement(): void
    {
        $this->authorizeSuperadmin();

        abort_if(strtolower((string) Auth::user()?->accountRole?->name) !== 'admin', 403, 'Unauthorized');
    }

    private function syncUserLocations(User $user, array $locationIds): void
    {
        $locationIds = array_values(array_unique($locationIds));
        UserLocation::where('user_id', $user->username)
            ->whereNotIn('location_id', $locationIds)
            ->delete();

        foreach ($locationIds as $locationId) {
            UserLocation::firstOrCreate(
                ['user_id' => $user->username, 'location_id' => $locationId],
                ['job_level' => $this->defaultAppJobLevel($user)]
            );
        }
    }

    private function formatUser(User $user): array
    {
        $leaderLine = $user->leaderLines->first();

        return [
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'initial_store' => $user->initial_store,
            'job_level_id' => $user->job_level_id,
            'role_id' => $user->role_id,
            'account_role' => $user->accountRole?->name,
            'job_level_name' => $user->jobLevel?->name,
            'corporate_job_level_name' => $user->jobLevel?->name,
            'role_type' => $user->role_type,
            'manager_type' => $user->manager_type,
            'active' => (bool) $user->active,
            'locations' => $user->locations->map(fn(Location $location) => [
                'initial' => $location->initial,
                'name' => $location->name,
                'app_job_level' => $location->pivot?->job_level,
            ])->values(),
            'leader' => $leaderLine?->leader ? [
                'username' => $leaderLine->leader->username,
                'name' => $leaderLine->leader->name,
            ] : null,
            'subordinates_count' => $user->subordinate_lines_count ?? $user->subordinateLines->count(),
        ];
    }

    private function validatedRole(Request $request, ?Role $role = null): array
    {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')->ignore($role?->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
            'permissions' => ['array'],
            'permissions.*' => [Rule::in(array_keys(self::CMS_PERMISSIONS))],
        ]);

        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'permissions' => array_values(array_unique($data['permissions'] ?? [])),
        ];
    }

    private function validatedAppRole(Request $request, ?AppRole $appRole = null): array
    {
        $request->merge([
            'name' => strtolower(str_replace(' ', '_', trim((string) $request->input('name')))),
        ]);

        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                'regex:/^[a-z0-9_]+$/',
                Rule::unique('app_roles', 'name')->ignore($appRole?->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
            'active' => ['boolean'],
        ]);

        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'active' => $data['active'] ?? true,
        ];
    }

    private function formatRole(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'permissions' => $role->permissions ?: [],
            'users_count' => $role->users()->count(),
        ];
    }

    private function formatAppRole(AppRole $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'active' => (bool) $role->active,
            'users_count' => UserLocation::where('job_level', $role->name)->count(),
        ];
    }

    private function appJobLevelNames()
    {
        $roles = AppRole::where('active', true)->orderBy('name')->pluck('name');

        if ($roles->isEmpty()) {
            return collect(self::DEFAULT_APP_JOB_LEVELS);
        }

        return $roles;
    }

    private function formatUserLocation(UserLocation $assignment): array
    {
        return [
            'id' => $assignment->id,
            'user_id' => $assignment->user_id,
            'user_name' => $assignment->user?->name,
            'location_id' => $assignment->location_id,
            'location_name' => $assignment->location?->name,
            'job_level' => $assignment->job_level,
        ];
    }

    private function defaultAppJobLevel(User $user): ?string
    {
        $role = strtolower(trim((string) $user->jobLevel?->name));

        return match ($role) {
            'crew', 'employee', 'sc' => 'sc',
            'supervisor' => 'supervisor',
            'regional_manager' => 'regional_manager',
            'manager' => 'manager',
            default => null,
        };
    }

    private function defaultAccountRoleId(): ?int
    {
        return Role::where('name', 'user')->value('id');
    }

    private function formatReportingLine(ReportingLine $line): array
    {
        return [
            'id' => $line->id,
            'leader_id' => $line->leader_id,
            'leader_name' => $line->leader?->name,
            'subordinate_id' => $line->subordinate_id,
            'subordinate_name' => $line->subordinate?->name,
            'status' => $line->status,
        ];
    }

    private function validatedEvaluationMaster(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'subtitle' => ['required', 'string', 'max:255'],
            'question' => ['required', 'string', 'max:255'],
            'answers' => ['required', 'array', 'size:5'],
            'answers.*' => ['required', 'string', 'max:1000'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'active' => ['boolean'],
        ]);

        return [
            'title' => $data['title'],
            'subtitle' => $data['subtitle'],
            'question' => $data['question'],
            'answers' => array_values($data['answers']),
            'sort_order' => $data['sort_order'] ?? 0,
            'active' => $data['active'] ?? true,
        ];
    }

    private function formatEvaluationMaster(EvaluationMaster $master): array
    {
        return [
            'id' => $master->id,
            'key' => 'evaluation_' . $master->id,
            'title' => $master->title,
            'subtitle' => $master->subtitle,
            'question' => $master->question,
            'label' => $master->question,
            'answers' => $master->answers ?: [],
            'desc' => collect($master->answers ?: [])->map(fn($answer, $index) => ($index + 1) . '. ' . $answer)->implode("\n"),
            'sort_order' => $master->sort_order,
            'active' => (bool) $master->active,
        ];
    }

    private function validateReportingLineHierarchy(string $leaderId, string $subordinateId)
    {
        $leader = User::where('username', $leaderId)->first();
        $subordinate = User::where('username', $subordinateId)->first();

        if (!$leader || !$subordinate) return;

        $levels = [
            'employee' => 1,
            'supervisor' => 2,
            'manager' => 3,
            'superadmin' => 4,
        ];

        $leaderRank = $levels[$leader->role_type] ?? 0;
        if ($leader->role_type === 'manager' && $leader->manager_type === 'RM') {
            $leaderRank = 3.5;
        }

        $subRank = $levels[$subordinate->role_type] ?? 0;
        if ($subordinate->role_type === 'manager' && $subordinate->manager_type === 'RM') {
            $subRank = 3.5;
        }

        if ($leaderRank <= $subRank) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'leader_id' => ['Leader must have a higher role level than the subordinate (e.g. Supervisor leads Employee, Manager leads Supervisor).']
            ]);
        }
    }
}
