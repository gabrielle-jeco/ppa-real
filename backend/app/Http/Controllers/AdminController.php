<?php

namespace App\Http\Controllers;

use App\Models\JobLevel;
use App\Models\Location;
use App\Models\ReportingLine;
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
    public function overview()
    {
        $this->authorizeSuperadmin();

        $users = User::with(['jobLevel', 'locations', 'leaderLines.leader', 'subordinateLines.subordinate'])
            ->orderBy('name')
            ->get()
            ->map(fn(User $user) => $this->formatUser($user));

        $reportingLines = ReportingLine::with(['leader.jobLevel', 'subordinate.jobLevel'])
            ->orderBy('leader_id')
            ->orderBy('subordinate_id')
            ->get()
            ->map(fn(ReportingLine $line) => $this->formatReportingLine($line));

        $workStations = WorkStation::orderBy('name')->get()->map(fn(WorkStation $station) => [
            'id' => $station->id,
            'name' => $station->name,
            'guide_content' => $station->guide_content ?: [],
        ]);

        return response()->json([
            'stats' => [
                'users' => $users->count(),
                'active_users' => $users->where('active', true)->count(),
                'locations' => Location::count(),
                'reporting_lines' => $reportingLines->where('status', 'active')->count(),
                'work_stations' => $workStations->count(),
            ],
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
            'users' => $users,
            'reporting_lines' => $reportingLines,
            'work_stations' => $workStations,
        ]);
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
            'active' => ['boolean'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $user = User::create([
            'username' => $data['username'],
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'password' => Hash::make($data['password'] ?? 'password'),
            'job_level_id' => $data['job_level_id'],
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

    public function storeJobLevel(Request $request)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:job_levels,name'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $jobLevel = JobLevel::create($data);

        return response()->json($jobLevel, 201);
    }

    public function updateJobLevel(Request $request, JobLevel $jobLevel)
    {
        $this->authorizeSuperadmin();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('job_levels', 'name')->ignore($jobLevel->id)],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $jobLevel->update($data);

        return response()->json($jobLevel->fresh());
    }

    public function destroyJobLevel(JobLevel $jobLevel)
    {
        $this->authorizeSuperadmin();

        if ($jobLevel->users()->exists()) {
            throw ValidationException::withMessages([
                'job_level' => ['This role is still assigned to one or more users. Move those users first.'],
            ]);
        }

        $jobLevel->delete();

        return response()->json(['message' => 'Role deleted.']);
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
            'active' => ['boolean'],
            'location_ids' => ['array'],
            'location_ids.*' => ['exists:locations,initial'],
        ]);

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'job_level_id' => $data['job_level_id'],
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

    private function authorizeSuperadmin(): void
    {
        abort_if(Auth::user()?->role_type !== 'superadmin', 403, 'Unauthorized');
    }

    private function syncUserLocations(User $user, array $locationIds): void
    {
        UserLocation::where('user_id', $user->username)->delete();

        foreach (array_unique($locationIds) as $locationId) {
            UserLocation::create([
                'user_id' => $user->username,
                'location_id' => $locationId,
            ]);
        }
    }

    private function formatUser(User $user): array
    {
        $leaderLine = $user->leaderLines->first();

        return [
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'job_level_id' => $user->job_level_id,
            'job_level_name' => $user->jobLevel?->name,
            'role_type' => $user->role_type,
            'active' => (bool) $user->active,
            'locations' => $user->locations->map(fn(Location $location) => [
                'initial' => $location->initial,
                'name' => $location->name,
            ])->values(),
            'leader' => $leaderLine?->leader ? [
                'username' => $leaderLine->leader->username,
                'name' => $leaderLine->leader->name,
            ] : null,
            'subordinates_count' => $user->subordinateLines->count(),
        ];
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
}
