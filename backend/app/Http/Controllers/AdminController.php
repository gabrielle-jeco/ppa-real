<?php

namespace App\Http\Controllers;

use App\Models\JobLevel;
use App\Models\Location;
use App\Models\Regional;
use App\Models\ReportingLine;
use App\Models\Role;
use App\Models\User;
use App\Models\UserLocation;
use App\Models\WorkStation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private const APP_JOB_LEVELS = ['sc', 'supervisor', 'manager', 'regional_manager'];

    public function overview()
    {
        $this->authorizeSuperadmin();

        $workStations = WorkStation::orderBy('name')->get()->map(fn(WorkStation $station) => [
            'id' => $station->id,
            'name' => $station->name,
            'guide_content' => $station->guide_content ?: [],
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
            ],
            'roles' => Role::orderBy('name')->get(['id', 'name']),
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
            'app_job_levels' => self::APP_JOB_LEVELS,
            'regionals' => Regional::orderBy('kode_regional')->get(),
        ]);
    }

    public function getUsers(Request $request)
    {
        $this->authorizeSuperadmin();

        $query = User::with(['accountRole', 'jobLevel', 'locations', 'leaderLines.leader', 'subordinateLines.subordinate'])
            ->orderBy('name');

        if ($request->has('search') && $request->search !== '') {
            $searchTerm = '%' . $request->search . '%';
            $query->where(function ($q) use ($searchTerm) {
                $q->where('name', 'like', $searchTerm)
                  ->orWhere('username', 'like', $searchTerm);
            });
        }

        $paginator = $query->paginate(50);
        
        $paginator->getCollection()->transform(function (User $user) {
            return $this->formatUser($user);
        });

        return response()->json($paginator);
    }

    public function getUserLocations(Request $request)
    {
        $this->authorizeSuperadmin();

        $query = UserLocation::with(['user', 'location']);

        if ($request->has('search')) {
            $search = strtolower($request->query('search'));
            $query->whereHas('user', function ($q) use ($search) {
                $q->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                  ->orWhereRaw('LOWER(username) like ?', ["%{$search}%"]);
            })->orWhereHas('location', function ($q) use ($search) {
                $q->whereRaw('LOWER(name) like ?', ["%{$search}%"])
                  ->orWhereRaw('LOWER(initial) like ?', ["%{$search}%"]);
            });
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
        $this->authorizeSuperadmin();
        
        $leaderUsernames = UserLocation::whereIn('job_level', ['supervisor', 'manager', 'regional_manager'])->pluck('user_id');
        
        $leaders = User::whereIn('username', $leaderUsernames)
            ->orWhereHas('accountRole', function($q) {
                $q->where('name', 'admin');
            })
            ->orderBy('name')
            ->get(['username', 'name']);
            
        // We actually want just username, name and maybe role_type for the dropdown label.
        $leadersArray = $leaders->map(function(User $u) {
            return [
                'username' => $u->username,
                'name' => $u->name,
                'role_type' => $u->role_type // accessor
            ];
        });

        return response()->json($leadersArray);
    }

    public function getReportingLines(Request $request)
    {
        $this->authorizeSuperadmin();
        
        $query = ReportingLine::with(['leader.jobLevel', 'subordinate.jobLevel'])
            ->orderBy('leader_id')
            ->orderBy('subordinate_id');
            
        if ($request->has('leader_id') && $request->leader_id !== '') {
            $query->where('leader_id', $request->leader_id);
        }

        $lines = $query->get()->map(function (ReportingLine $line) {
            return $this->formatReportingLine($line);
        });

        return response()->json($lines);
    }

    public function storeUser(Request $request)
    {
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();

        $reportingLine->delete();

        return response()->json(['message' => 'Reporting line deleted.']);
    }

    public function storeWorkStation(Request $request)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'guide_content' => ['array'],
            'guide_content.*' => ['string', 'max:1000'],
        ]);

        $station = WorkStation::create([
            'name' => $data['name'],
            'guide_content' => array_values($data['guide_content'] ?? []),
        ]);

        return response()->json($station, 201);
    }

    public function updateWorkStation(Request $request, WorkStation $workStation)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'guide_content' => ['array'],
            'guide_content.*' => ['string', 'max:1000'],
        ]);

        $workStation->update([
            'name' => $data['name'],
            'guide_content' => array_values($data['guide_content'] ?? []),
        ]);

        return response()->json($workStation->fresh());
    }

    public function updateUserLocation(Request $request, UserLocation $userLocation)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'job_level' => ['required', Rule::in(self::APP_JOB_LEVELS)],
        ]);

        $userLocation->update([
            'job_level' => strtolower(trim($data['job_level'])),
        ]);

        return response()->json($this->formatUserLocation($userLocation->fresh(['user', 'location'])));
    }

    public function syncUserLocationsFromUsers()
    {
        $this->authorizeSuperadmin();

        $created = 0;
        $users = User::whereNotNull('initial_store')->get();

        foreach ($users as $user) {
            $locationId = strtoupper(trim((string) $user->initial_store));
            if ($locationId === '' || !Location::where('initial', $locationId)->exists()) {
                continue;
            }

            $assignment = UserLocation::firstOrCreate(
                ['user_id' => $user->username, 'location_id' => $locationId],
                ['job_level' => $this->defaultAppJobLevel($user)]
            );

            if ($assignment->wasRecentlyCreated) {
                $created++;
            }
        }

        return response()->json(['message' => "{$created} user-location assignment(s) synchronized.", 'created' => $created]);
    }

    public function storeRegional(Request $request)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'kode_regional' => ['required', 'string', 'max:255', 'unique:regional,kode_regional'],
            'nama_regional' => ['required', 'string', 'max:255'],
            'cabang' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json(Regional::create($data), 201);
    }

    public function updateRegional(Request $request, Regional $regional)
    {
        $this->authorizeSuperadmin();

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
        $this->authorizeSuperadmin();
        $regional->delete();

        return response()->json(['message' => 'Regional deleted.']);
    }

    private function authorizeSuperadmin(): void
    {
        abort_if(Auth::user()?->role_type !== 'superadmin', 403, 'Unauthorized');
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
            'subordinates_count' => $user->subordinateLines->count(),
        ];
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
