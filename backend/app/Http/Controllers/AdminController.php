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
use App\Models\UserLoginEvent;
use App\Models\UserPresence;
use App\Models\WorkStation;
use App\Services\ReportingLineSpreadsheetService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private const DEFAULT_APP_JOB_LEVELS = ['sc', 'supervisor', 'manager', 'regional_manager'];
    private const CMS_PERMISSIONS = [
        'users_locations' => 'User & Lokasi',
        'job_levels' => 'Job Level HR',
        'app_roles' => 'Role Aplikasi',
        'reporting_lines' => 'Relasi Atasan',
        'work_stations' => 'Master Work Station',
        'locations' => 'Master Lokasi',
        'regionals' => 'Master Regional',
        'evaluation_masters' => 'Master Evaluasi',
        'role_management' => 'Role Akun',
        'user_activity' => 'Aktivitas User',
    ];

    public function overview()
    {
        $this->authorizeSuperadmin();
        $canUseLocations = $this->canAnyPermission(['users_locations', 'app_roles', 'reporting_lines', 'locations', 'user_activity']);

        $workStations = $this->canPermission('work_stations') ? WorkStation::orderBy('name')->get()->map(fn(WorkStation $station) => [
            'id' => $station->id,
            'name' => $station->name,
            'guide_content' => $station->guide_content ?: [],
            'active' => (bool) $station->active,
        ]) : collect();

        return response()->json([
            'stats' => [
                'users' => $this->canPermission('users_locations') ? User::count() : 0,
                'active_users' => $this->canPermission('users_locations') ? User::where('active', true)->count() : 0,
                'locations' => $this->canPermission('locations') ? Location::count() : 0,
                'reporting_lines' => $this->canPermission('reporting_lines')
                    ? ReportingLine::withoutGlobalScope('effective_backup_period')
                        ->where('relation_type', 'permanent')
                        ->where('status', 'active')
                        ->count()
                    : 0,
                'work_stations' => $workStations->count(),
                'user_locations' => $this->canPermission('app_roles') ? UserLocation::count() : 0,
                'regionals' => $this->canPermission('regionals') ? Regional::count() : 0,
                'account_roles' => $this->canPermission('role_management') ? Role::count() : 0,
                'app_roles' => $this->canPermission('app_roles') ? AppRole::count() : 0,
                'evaluation_masters' => $this->canPermission('evaluation_masters') ? EvaluationMaster::count() : 0,
                'job_levels' => $this->canPermission('job_levels') ? JobLevel::where('visible_in_yodaily', true)->count() : 0,
                'online_users' => $this->canPermission('user_activity') ? UserPresence::where('last_seen_at', '>=', now()->subMinutes(5))->distinct('user_id')->count('user_id') : 0,
            ],
            'roles' => $this->canPermission('role_management') ? Role::orderBy('name')->get()->map(fn(Role $role) => $this->formatRole($role)) : [],
            'cms_permissions' => $this->canPermission('role_management') ? collect(self::CMS_PERMISSIONS)->map(fn($label, $key) => ['key' => $key, 'label' => $label])->values() : [],
            'current_account_role' => Auth::user()?->accountRole?->name,
            'current_permissions' => Auth::user()?->accountRole?->permissions ?: [],
            'job_levels' => $this->canAnyPermission(['users_locations', 'job_levels']) ? JobLevel::where('visible_in_yodaily', true)
                ->orderBy('name')
                ->get(['id', 'position_code', 'name', 'description', 'grade', 'department', 'visible_in_yodaily', 'external_active']) : [],
            'locations' => $canUseLocations ? Location::orderBy('name')->get([
                'initial',
                'name',
                'store_code',
                'address',
                'city',
                'phone',
                'region_code',
                'is_active',
                'type_store',
            ]) : [],
            'work_stations' => $workStations,
            'app_roles' => $this->canPermission('app_roles') ? AppRole::orderBy('name')->get()->map(fn(AppRole $role) => $this->formatAppRole($role)) : [],
            'app_job_levels' => $this->canPermission('app_roles') ? $this->appJobLevelNames() : [],
            'regionals' => $this->canPermission('regionals') ? Regional::orderBy('kode_regional')->get() : [],
            'evaluation_masters' => $this->canPermission('evaluation_masters') ? EvaluationMaster::orderBy('sort_order')->orderBy('id')->get()->map(fn(EvaluationMaster $master) => $this->formatEvaluationMaster($master)) : [],
        ]);
    }

    public function getJobLevels(Request $request)
    {
        $this->authorizePermission('job_levels');

        $query = JobLevel::orderBy('name');

        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(COALESCE(position_code, \'\')) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(COALESCE(grade, \'\')) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(COALESCE(department, \'\')) like ?', ["%{$search}%"]);
            });
        }

        if ($request->filled('visibility')) {
            if ($request->query('visibility') === 'visible') {
                $query->where('visible_in_yodaily', true);
            } elseif ($request->query('visibility') === 'hidden') {
                $query->where('visible_in_yodaily', false);
            }
        }

        $paginator = $query->paginate(50);
        $paginator->getCollection()->transform(fn(JobLevel $jobLevel) => $this->formatJobLevel($jobLevel));

        return response()->json($paginator);
    }

    public function getUsers(Request $request)
    {
        $this->authorizePermission('users_locations');

        $query = User::without(['jobLevel', 'locations', 'userLocations'])
            ->where(function ($q) {
                $q->whereHas('jobLevel', fn($jobLevelQuery) => $jobLevelQuery->where('visible_in_yodaily', true))
                    ->orWhereHas('userLocations');
            })
            ->with([
                'accountRole:id,name,description,permissions',
                'jobLevel:id,position_code,name,grade,department',
                'locations:initial,name',
                'userLocations:user_id,job_level',
                'leaderLines' => fn($q) => $q
                    ->where('relation_type', 'permanent')
                    ->where('status', 'active')
                    ->with('leader:username,name')
                    ->select(['id', 'leader_id', 'subordinate_id', 'status']),
            ])
            ->withCount([
                'subordinateLines' => fn($q) => $q->where('relation_type', 'permanent'),
            ])
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
        $this->authorizePermission('app_roles');

        $query = UserLocation::with(['user.jobLevel', 'location'])
            ->whereHas('user');

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

        $leaders = User::where(function ($query) use ($leaderRoles) {
            $query->whereHas('userLocations', fn($q) => $q->whereIn('job_level', $leaderRoles))
                ->orWhereHas('accountRole', fn($q) => $q->where('name', 'admin'));
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

    public function getReportingUsers(Request $request)
    {
        $this->authorizePermission('reporting_lines');

        $query = User::without(['jobLevel'])
            ->whereHas('userLocations')
            ->with(['jobLevel:id,position_code,name,grade,department'])
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(username) like ?', ["%{$search}%"]);
            });
        }

        if ($request->filled('store')) {
            $query->whereHas('locations', fn($q) => $q->where('locations.initial', $request->query('store')));
        }

        return response()->json($query->get(['username', 'name', 'job_level_id'])->map(fn(User $user) => [
            'username' => $user->username,
            'name' => $user->name,
            'role_type' => $user->role_type,
        ]));
    }

    public function getReportingLines(Request $request)
    {
        $this->authorizePermission('reporting_lines');
        
        $query = ReportingLine::withoutGlobalScope('effective_backup_period')
            ->where('relation_type', 'permanent')
            ->with(['leader.jobLevel', 'subordinate.jobLevel'])
            ->whereHas('leader.userLocations')
            ->whereHas('subordinate.userLocations')
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

    public function getOnlineUsers(Request $request)
    {
        $this->authorizePermission('user_activity');

        $query = UserPresence::with([
                'user.accountRole:id,name',
                'user.jobLevel:id,position_code,name',
                'user.locations:initial,name',
                'user.userLocations:user_id,job_level',
            ])
            ->where('last_seen_at', '>=', now()->subMinutes(5))
            ->whereHas('user')
            ->orderByDesc('last_seen_at');

        $this->applyActivityFilters($query, $request);

        $paginator = $query->paginate(50);
        $paginator->getCollection()->transform(fn(UserPresence $presence) => $this->formatPresence($presence));

        return response()->json($paginator);
    }

    public function getRecentLogins(Request $request)
    {
        $this->authorizePermission('user_activity');

        $days = (int) $request->query('days', 7);
        $days = min(max($days, 1), 30);
        $since = now()->subDays($days - 1)->startOfDay();

        $query = UserLoginEvent::query()
            ->select('user_id')
            ->selectRaw('MAX(login_at) as latest_login_at')
            ->selectRaw('MAX(id) as latest_event_id')
            ->selectRaw('COUNT(*) as login_count')
            ->where('login_at', '>=', $since)
            ->whereHas('user')
            ->groupBy('user_id')
            ->orderByDesc('latest_login_at')
            ->with([
                'user.accountRole:id,name',
                'user.jobLevel:id,position_code,name',
                'user.locations:initial,name',
                'user.userLocations:user_id,job_level',
            ]);

        $this->applyLoginFilters($query, $request);

        $paginator = $query->paginate(50);
        $paginator->getCollection()->transform(fn(UserLoginEvent $event) => $this->formatRecentLogin($event));

        return response()->json($paginator);
    }

    public function storeUser(Request $request)
    {
        $this->authorizePermission('users_locations');

        $data = $request->validate([
            'username' => ['required', 'string', 'max:255', 'unique:users,username'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'job_level_id' => ['required', $this->visibleJobLevelRule()],
            'role_id' => ['nullable', 'exists:roles,id'],
            'active' => ['boolean'],
            'is_back_office' => ['boolean'],
            'initial_store' => ['nullable', 'exists:locations,initial'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $roleId = $this->canPermission('role_management')
            ? ($data['role_id'] ?? $this->defaultAccountRoleId())
            : $this->defaultAccountRoleId();
        $accountRole = Role::find($roleId);

        if ($accountRole?->isCmsRole() && empty($data['password'])) {
            throw ValidationException::withMessages([
                'password' => ['Password wajib diisi minimal 8 karakter untuk akun yang dapat mengakses CMS.'],
            ]);
        }

        $user = User::create([
            'username' => $data['username'],
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'password' => Hash::make($data['password'] ?? Str::random(40)),
            'job_level_id' => $data['job_level_id'],
            'role_id' => $roleId,
            'initial_store' => $data['initial_store'] ?? null,
            'active' => $data['active'] ?? true,
            'is_back_office' => $data['is_back_office'] ?? false,
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
                'location' => ['Lokasi masih digunakan oleh satu atau beberapa user. Nonaktifkan lokasi sebagai gantinya.'],
            ]);
        }

        $location->delete();

        return response()->json(['message' => 'Lokasi berhasil dihapus.']);
    }



    public function updateUser(Request $request, string $username)
    {
        $this->authorizePermission('users_locations');

        $user = User::where('username', $username)->firstOrFail();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'job_level_id' => ['required', $this->visibleJobLevelRule()],
            'role_id' => ['nullable', 'exists:roles,id'],
            'active' => ['boolean'],
            'is_back_office' => ['boolean'],
            'initial_store' => ['nullable', 'exists:locations,initial'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $roleId = $this->canPermission('role_management')
            ? ($data['role_id'] ?? $this->defaultAccountRoleId())
            : $user->role_id;
        $targetRole = Role::find($roleId);

        if ($targetRole?->isCmsRole() && !$user->accountRole?->isCmsRole() && empty($data['password'])) {
            throw ValidationException::withMessages([
                'password' => ['Password wajib diisi minimal 8 karakter saat memberikan akses CMS.'],
            ]);
        }

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'job_level_id' => $data['job_level_id'],
            'role_id' => $roleId,
            'initial_store' => $data['initial_store'] ?? null,
            'active' => $data['active'] ?? false,
            'is_back_office' => $data['is_back_office'] ?? false,
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

        $line = ReportingLine::withoutGlobalScope('effective_backup_period')->updateOrCreate(
            [
                'leader_id' => $data['leader_id'],
                'subordinate_id' => $data['subordinate_id'],
                'relation_type' => 'permanent',
            ],
            [
                'status' => $data['status'],
                'backup_request_id' => null,
                'effective_from' => null,
                'effective_until' => null,
            ]
        );

        return response()->json($this->formatReportingLine($line->fresh(['leader', 'subordinate'])), 201);
    }

    public function updateReportingLine(Request $request, ReportingLine $reportingLine)
    {
        $this->authorizePermission('reporting_lines');
        abort_if($reportingLine->relation_type !== 'permanent', 404);

        $data = $request->validate([
            'leader_id' => ['required', 'exists:users,username', 'different:subordinate_id'],
            'subordinate_id' => ['required', 'exists:users,username'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);

        $this->validateReportingLineHierarchy($data['leader_id'], $data['subordinate_id']);

        $reportingLine->update([
            ...$data,
            'relation_type' => 'permanent',
            'backup_request_id' => null,
            'effective_from' => null,
            'effective_until' => null,
        ]);

        return response()->json($this->formatReportingLine($reportingLine->fresh(['leader', 'subordinate'])));
    }

    public function destroyReportingLine(ReportingLine $reportingLine)
    {
        $this->authorizePermission('reporting_lines');
        abort_if($reportingLine->relation_type !== 'permanent', 404);

        $reportingLine->delete();

        return response()->json(['message' => 'Reporting line deleted.']);
    }

    public function downloadReportingLineImportTemplate(ReportingLineSpreadsheetService $spreadsheetService)
    {
        $this->authorizePermission('reporting_lines');

        return response()->streamDownload(
            fn() => $spreadsheetService->writeTemplate('php://output'),
            'template-import-relasi-atasan.xlsx',
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    public function previewReportingLineImport(Request $request, ReportingLineSpreadsheetService $spreadsheetService)
    {
        $this->authorizePermission('reporting_lines');
        $request->validate([
            'file' => ['required', 'file', 'max:' . ReportingLineSpreadsheetService::MAX_FILE_KILOBYTES],
        ]);

        $analysis = $this->reportingLineImportAnalysis($spreadsheetService->parse($request->file('file')));
        unset($analysis['valid']);

        return response()->json($analysis);
    }

    public function importReportingLines(Request $request, ReportingLineSpreadsheetService $spreadsheetService)
    {
        $this->authorizePermission('reporting_lines');
        $request->validate([
            'file' => ['required', 'file', 'max:' . ReportingLineSpreadsheetService::MAX_FILE_KILOBYTES],
        ]);

        $analysis = $this->reportingLineImportAnalysis($spreadsheetService->parse($request->file('file')), false);
        $newRows = collect($analysis['valid'])->where('action', 'create')->map(fn(array $row) => [
            'leader_id' => $row['leader_id'],
            'subordinate_id' => $row['subordinate_id'],
            'status' => 'active',
            'relation_type' => 'permanent',
            'backup_request_id' => null,
            'effective_from' => null,
            'effective_until' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ])->values();
        $reactivateIds = collect($analysis['valid'])->where('action', 'reactivate')->pluck('reporting_line_id')->filter()->values();

        [$created, $reactivated] = DB::transaction(function () use ($newRows, $reactivateIds) {
            $created = 0;
            foreach ($newRows->chunk(500) as $chunk) {
                $created += DB::table('reporting_lines')->insertOrIgnore($chunk->all());
            }

            $reactivated = 0;
            foreach ($reactivateIds->chunk(1000) as $chunk) {
                $reactivated += ReportingLine::withoutGlobalScope('effective_backup_period')
                    ->whereIn('id', $chunk->all())
                    ->where('relation_type', 'permanent')
                    ->update(['status' => 'active', 'updated_at' => now()]);
            }

            return [$created, $reactivated];
        });

        return response()->json([
            'message' => ($created + $reactivated) . ' relasi berhasil diimport.',
            'summary' => [
                'created' => $created,
                'reactivated' => $reactivated,
                'duplicates' => $analysis['summary']['duplicates'],
                'invalid' => $analysis['summary']['invalid'],
            ],
        ]);
    }

    public function storeWorkStation(Request $request)
    {
        $this->authorizePermission('work_stations');

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
        $this->authorizePermission('work_stations');

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
        $this->authorizePermission('work_stations');

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

    public function updateJobLevel(Request $request, JobLevel $jobLevel)
    {
        $this->authorizePermission('job_levels');

        $data = $request->validate([
            'visible_in_yodaily' => ['required', 'boolean'],
        ]);

        $jobLevel->update([
            'visible_in_yodaily' => $data['visible_in_yodaily'],
        ]);

        return response()->json($this->formatJobLevel($jobLevel->fresh()));
    }

    public function updateUserLocation(Request $request, UserLocation $userLocation)
    {
        $this->authorizePermission('app_roles');

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
        $this->authorizePermission('app_roles');

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
        $this->authorizePermission('app_roles');

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
                AND COALESCE(job_levels.visible_in_yodaily, FALSE) = TRUE
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
        $this->authorizePermission('app_roles');

        $role = AppRole::create($this->validatedAppRole($request));

        return response()->json($this->formatAppRole($role), 201);
    }

    public function updateAppRole(Request $request, AppRole $appRole)
    {
        $this->authorizePermission('app_roles');

        $appRole->update($this->validatedAppRole($request, $appRole));

        return response()->json($this->formatAppRole($appRole->fresh()));
    }

    public function destroyAppRole(AppRole $appRole)
    {
        $this->authorizePermission('app_roles');

        if (UserLocation::where('job_level', $appRole->name)->exists()) {
            throw ValidationException::withMessages([
                'app_role' => ['This app role is still assigned to one or more users. Move those users first.'],
            ]);
        }

        $appRole->delete();

        return response()->json(['message' => 'Role aplikasi berhasil dihapus.']);
    }

    public function storeRole(Request $request)
    {
        $this->authorizeRoleManagement();

        $data = $this->validatedRole($request);
        $data['name'] = strtolower(trim($data['name']));
        if ($data['name'] === 'admin') {
            $data['permissions'] = array_keys(self::CMS_PERMISSIONS);
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
            $data['permissions'] = array_keys(self::CMS_PERMISSIONS);
        }

        $role->update($data);

        return response()->json($this->formatRole($role->fresh()));
    }

    public function destroyRole(Role $role)
    {
        $this->authorizeRoleManagement();

        if (in_array(strtolower($role->name), ['admin', 'user'], true)) {
            throw ValidationException::withMessages([
                'role' => ['Role bawaan tidak dapat dihapus.'],
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
        abort_if(Auth::user()?->role_type !== 'superadmin', 403, 'Tidak memiliki akses.');
    }

    private function authorizePermission(string $permission): void
    {
        $this->authorizeSuperadmin();

        abort_if(!$this->canPermission($permission), 403, 'Tidak memiliki akses.');
    }

    private function canPermission(string $permission): bool
    {
        return (bool) Auth::user()?->accountRole?->hasPermission($permission);
    }

    private function canAnyPermission(array $permissions): bool
    {
        return collect($permissions)->contains(fn($permission) => $this->canPermission($permission));
    }

    private function authorizeRoleManagement(): void
    {
        $this->authorizePermission('role_management');
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
            'job_level_position_code' => $user->jobLevel?->position_code,
            'role_type' => $user->role_type,
            'manager_type' => $user->manager_type,
            'active' => (bool) $user->active,
            'is_back_office' => (bool) $user->is_back_office,
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

    private function applyActivityFilters($query, Request $request): void
    {
        if ($request->filled('search')) {
            $search = strtolower($request->query('search'));
            $query->whereHas('user', function ($userQuery) use ($search) {
                $userQuery->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                    ->orWhereRaw('LOWER(username) like ?', ["%{$search}%"]);
            });
        }

        if ($request->filled('store')) {
            $query->whereHas('user.locations', fn($locationQuery) => $locationQuery->where('locations.initial', $request->query('store')));
        }

        if ($request->filled('app_role')) {
            $query->whereHas('user.userLocations', fn($roleQuery) => $roleQuery->where('job_level', $request->query('app_role')));
        }

        if ($request->filled('device_type')) {
            $query->where('device_type', $request->query('device_type'));
        }
    }

    private function applyLoginFilters($query, Request $request): void
    {
        $this->applyActivityFilters($query, $request);

        if ($request->filled('login_source')) {
            $query->where('login_source', $request->query('login_source'));
        }
    }

    private function formatPresence(UserPresence $presence): array
    {
        $user = $presence->user;

        return [
            'id' => $presence->id,
            'username' => $presence->user_id,
            'name' => $user?->name ?? $presence->user_id,
            'role_type' => $user?->role_type,
            'account_role' => $user?->accountRole?->name,
            'app_roles' => $user?->userLocations->pluck('job_level')->filter()->unique()->values() ?? [],
            'locations' => $user?->locations->map(fn(Location $location) => [
                'initial' => $location->initial,
                'name' => $location->name,
            ])->values() ?? [],
            'device_type' => $presence->device_type,
            'last_url' => $presence->last_url,
            'last_seen_at' => $presence->last_seen_at?->toIso8601String(),
            'last_seen_label' => $presence->last_seen_at ? $presence->last_seen_at->diffForHumans() : '-',
            'ip_address' => $presence->ip_address,
        ];
    }

    private function formatRecentLogin(UserLoginEvent $event): array
    {
        $user = $event->user;
        $latestLogin = $event->latest_login_at ? Carbon::parse($event->latest_login_at) : null;
        $latestEvent = UserLoginEvent::where('id', $event->latest_event_id)
            ->first(['device_type', 'login_source']);

        return [
            'username' => $event->user_id,
            'name' => $user?->name ?? $event->user_id,
            'role_type' => $user?->role_type,
            'account_role' => $user?->accountRole?->name,
            'app_roles' => $user?->userLocations->pluck('job_level')->filter()->unique()->values() ?? [],
            'locations' => $user?->locations->map(fn(Location $location) => [
                'initial' => $location->initial,
                'name' => $location->name,
            ])->values() ?? [],
            'latest_login_at' => $latestLogin?->toIso8601String(),
            'latest_login_label' => $latestLogin ? $latestLogin->diffForHumans() : '-',
            'device_type' => $latestEvent?->device_type,
            'login_source' => $latestEvent?->login_source,
            'login_count' => (int) $event->login_count,
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

    private function visibleJobLevelRule()
    {
        return Rule::exists('job_levels', 'id')->where('visible_in_yodaily', true);
    }

    private function formatJobLevel(JobLevel $jobLevel): array
    {
        return [
            'id' => $jobLevel->id,
            'position_code' => $jobLevel->position_code,
            'name' => $jobLevel->name,
            'description' => $jobLevel->description,
            'grade' => $jobLevel->grade,
            'department' => $jobLevel->department,
            'visible_in_yodaily' => (bool) $jobLevel->visible_in_yodaily,
            'external_active' => (bool) $jobLevel->external_active,
            'synced_at' => $jobLevel->synced_at?->toDateTimeString(),
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
            'answers' => ['required', 'array', 'min:1'],
            'answers.*' => ['required', 'string', 'max:1000'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'active' => ['boolean'],
        ]);

        return [
            'title' => $data['title'],
            'subtitle' => $data['subtitle'],
            'question' => $data['question'],
            'answers' => array_values(array_filter($data['answers'], fn($answer) => trim((string) $answer) !== '')),
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

        $leaderRank = $this->reportingLineRank($leader);
        $subRank = $this->reportingLineRank($subordinate);

        if ($leaderRank <= $subRank) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'leader_id' => ['Leader must have a higher role level than the subordinate (e.g. Supervisor leads Employee, Manager leads Supervisor).']
            ]);
        }
    }

    private function reportingLineImportAnalysis(array $parsed, bool $limitDetails = true): array
    {
        $relations = collect($parsed['relations'] ?? []);
        $ids = $relations->flatMap(fn(array $row) => [$row['leader_id'], $row['subordinate_id']])->unique()->values();

        $users = collect();
        foreach ($ids->chunk(5000) as $chunk) {
            $users = $users->merge(User::with(['accountRole', 'userLocations', 'locations'])
                ->whereIn('username', $chunk->all())
                ->get());
        }
        $users = $users->keyBy('username');

        $leaderIds = $relations->pluck('leader_id')->unique()->values();
        $subordinateIds = $relations->pluck('subordinate_id')->unique()->values();
        $existing = collect();
        foreach ($leaderIds->chunk(5000) as $leaderChunk) {
            foreach ($subordinateIds->chunk(5000) as $subordinateChunk) {
                $existing = $existing->merge(ReportingLine::withoutGlobalScope('effective_backup_period')
                    ->whereIn('leader_id', $leaderChunk->all())
                    ->whereIn('subordinate_id', $subordinateChunk->all())
                    ->get(['id', 'leader_id', 'subordinate_id', 'status', 'relation_type']));
            }
        }
        $existing = $existing->keyBy(fn(ReportingLine $line) => $line->leader_id . '|' . $line->subordinate_id);

        $valid = [];
        $duplicates = [];
        $invalid = $parsed['errors'] ?? [];
        $seen = [];

        foreach ($relations as $relation) {
            $key = $relation['leader_id'] . '|' . $relation['subordinate_id'];
            $context = [
                'row' => $relation['row'],
                'subordinate_id' => $relation['subordinate_id'],
                'leader_id' => $relation['leader_id'],
            ];

            if (isset($seen[$key])) {
                $duplicates[] = [...$context, 'reason' => 'Relasi berulang di dalam spreadsheet.'];
                continue;
            }
            $seen[$key] = true;

            $leader = $users->get($relation['leader_id']);
            $subordinate = $users->get($relation['subordinate_id']);
            if (!$leader || !$subordinate) {
                $missing = [];
                if (!$subordinate) {
                    $missing[] = "NIK bawahan {$relation['subordinate_id']} tidak ditemukan";
                }
                if (!$leader) {
                    $missing[] = "NIK atasan {$relation['leader_id']} tidak ditemukan";
                }
                $invalid[] = [...$context, 'reason' => implode('; ', $missing) . '.'];
                continue;
            }

            if ($leader->username === $subordinate->username) {
                $invalid[] = [...$context, 'reason' => 'Atasan dan bawahan tidak boleh merupakan user yang sama.'];
                continue;
            }

            if ($this->reportingLineRank($leader) <= $this->reportingLineRank($subordinate)) {
                $invalid[] = [...$context, 'reason' => 'Level aplikasi atasan harus lebih tinggi daripada bawahan.'];
                continue;
            }

            $existingLine = $existing->get($key);
            if ($existingLine?->relation_type === 'permanent') {
                if ($existingLine->status === 'active') {
                    $duplicates[] = [...$context, 'reason' => 'Relasi permanen sudah aktif.'];
                    continue;
                }

                $valid[] = [...$context, 'action' => 'reactivate', 'reporting_line_id' => $existingLine->id];
                continue;
            }

            if ($existingLine) {
                $invalid[] = [...$context, 'reason' => 'Pasangan NIK sedang digunakan oleh relasi backup sementara.'];
                continue;
            }

            $valid[] = [...$context, 'action' => 'create', 'reporting_line_id' => null];
        }

        $detailLimit = $limitDetails ? 100 : PHP_INT_MAX;

        return [
            'summary' => [
                'relations' => $relations->count(),
                'valid' => count($valid),
                'duplicates' => count($duplicates),
                'invalid' => count($invalid),
            ],
            'valid_rows' => array_slice($valid, 0, $detailLimit),
            'duplicate_rows' => array_slice($duplicates, 0, $detailLimit),
            'invalid_rows' => array_slice($invalid, 0, $detailLimit),
            'details_limited' => $limitDetails && (count($valid) > $detailLimit || count($duplicates) > $detailLimit || count($invalid) > $detailLimit),
            'valid' => $valid,
        ];
    }

    private function reportingLineRank(User $user): float
    {
        $rank = match ($user->role_type) {
            'employee' => 1,
            'supervisor' => 2,
            'manager' => 3,
            'superadmin' => 4,
            default => 0,
        };

        return $user->role_type === 'manager' && $user->manager_type === 'RM' ? 3.5 : $rank;
    }
}
