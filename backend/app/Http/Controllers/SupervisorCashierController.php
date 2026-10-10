<?php

namespace App\Http\Controllers;

use App\Models\PushSellingCampaign;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupervisorCashierController extends Controller
{
    public function overview()
    {
        $supervisor = $this->authorizedSupervisor();
        $locationId = $this->locationId($supervisor);
        $locationName = $supervisor->locations()
            ->where('locations.initial', $locationId)
            ->value('locations.name');

        return response()->json([
            'location' => [
                'id' => $locationId,
                'name' => $locationName ?: $locationId,
            ],
            'crew' => $this->permanentTeam($supervisor)->map(fn(User $crew) => [
                'id' => $crew->username,
                'name' => $crew->full_name,
                'cashier_id' => $crew->cashier_id,
            ])->values(),
            'integration' => $this->integrationStatus(),
        ]);
    }

    public function updateCashierId(string $crew, Request $request)
    {
        $supervisor = $this->authorizedSupervisor();
        $member = $this->permanentTeamMember($supervisor, $crew);

        $validated = $request->validate([
            'cashier_id' => [
                'nullable',
                'string',
                'max:64',
                Rule::unique('users', 'cashier_id')->ignore($member->id),
            ],
        ]);

        $cashierId = trim((string) ($validated['cashier_id'] ?? ''));
        $member->update(['cashier_id' => $cashierId !== '' ? $cashierId : null]);

        return response()->json([
            'message' => $member->cashier_id
                ? 'ID kasir berhasil disimpan.'
                : 'ID kasir berhasil dihapus.',
            'crew' => [
                'id' => $member->username,
                'name' => $member->full_name,
                'cashier_id' => $member->cashier_id,
            ],
        ]);
    }

    public function campaigns(Request $request)
    {
        $supervisor = $this->authorizedSupervisor();
        $locationId = $this->locationId($supervisor);
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['all', 'active', 'inactive'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,50'],
        ]);

        $query = PushSellingCampaign::query()
            ->with('creator:id,username,name')
            ->where('location_id', $locationId);

        $search = trim((string) ($validated['q'] ?? ''));
        if ($search !== '') {
            $term = mb_strtolower($search);
            $query->where(function ($builder) use ($term) {
                $builder->whereRaw('LOWER(plu) LIKE ?', ["%{$term}%"])
                    ->orWhereRaw('LOWER(product_name) LIKE ?', ["%{$term}%"]);
            });
        }

        $status = $validated['status'] ?? 'all';
        if ($status !== 'all') {
            $query->where('is_active', $status === 'active');
        }

        $campaigns = $query
            ->orderByDesc('is_active')
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? 10));

        return response()->json([
            'data' => collect($campaigns->items())->map(fn(PushSellingCampaign $campaign) => $this->campaignResource($campaign)),
            'pagination' => [
                'current_page' => $campaigns->currentPage(),
                'last_page' => $campaigns->lastPage(),
                'per_page' => $campaigns->perPage(),
                'total' => $campaigns->total(),
            ],
        ]);
    }

    public function storeCampaign(Request $request)
    {
        $supervisor = $this->authorizedSupervisor();
        $data = $this->campaignData($request);

        $campaign = PushSellingCampaign::create([
            ...$data,
            'location_id' => $this->locationId($supervisor),
            'created_by' => $supervisor->username,
            'updated_by' => $supervisor->username,
        ]);

        $campaign->load('creator:id,username,name');

        return response()->json([
            'message' => 'Campaign push selling berhasil dibuat.',
            'campaign' => $this->campaignResource($campaign),
        ], 201);
    }

    public function showCampaign(int $campaign)
    {
        $supervisor = $this->authorizedSupervisor();
        $record = $this->campaignForLocation($campaign, $this->locationId($supervisor));

        return response()->json([
            'campaign' => $this->campaignResource($record),
            'sales' => [
                'available' => false,
                'total_quantity' => null,
                'last_synced_at' => null,
                'rows' => [],
                'message' => $this->integrationStatus()['message'],
            ],
        ]);
    }

    public function updateCampaign(int $campaign, Request $request)
    {
        $supervisor = $this->authorizedSupervisor();
        $record = $this->campaignForLocation($campaign, $this->locationId($supervisor));
        $record->update([
            ...$this->campaignData($request),
            'updated_by' => $supervisor->username,
        ]);
        $record->load('creator:id,username,name');

        return response()->json([
            'message' => 'Campaign push selling berhasil diperbarui.',
            'campaign' => $this->campaignResource($record),
        ]);
    }

    private function authorizedSupervisor(): User
    {
        $user = Auth::user();
        abort_unless($user && $user->role_type === 'supervisor', 403, 'Tidak memiliki akses.');

        return $user;
    }

    private function locationId(User $supervisor): string
    {
        $locationId = trim((string) ($supervisor->initial_store ?: $supervisor->locations()->value('locations.initial')));
        if ($locationId === '') {
            throw ValidationException::withMessages([
                'location' => 'Supervisor belum memiliki cabang aktif.',
            ]);
        }

        return $locationId;
    }

    private function permanentTeam(User $supervisor)
    {
        return $supervisor->subordinateLines()
            ->where('status', 'active')
            ->where('relation_type', 'permanent')
            ->with('subordinate')
            ->get()
            ->pluck('subordinate')
            ->filter(fn($crew) => $crew && $crew->active)
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    private function permanentTeamMember(User $supervisor, string $crew): User
    {
        $member = $this->permanentTeam($supervisor)->firstWhere('username', $crew);
        abort_unless($member, 403, 'Karyawan bukan bawahan permanen aktif Anda.');

        return $member;
    }

    private function campaignForLocation(int $campaign, string $locationId): PushSellingCampaign
    {
        return PushSellingCampaign::with('creator:id,username,name')
            ->where('location_id', $locationId)
            ->findOrFail($campaign);
    }

    private function campaignData(Request $request): array
    {
        $validated = $request->validate([
            'plu' => ['required', 'string', 'max:100'],
            'product_name' => ['required', 'string', 'max:255'],
            'start_date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'is_active' => ['required', 'boolean'],
        ]);

        return [
            ...$validated,
            'plu' => trim($validated['plu']),
            'product_name' => trim($validated['product_name']),
        ];
    }

    private function campaignResource(PushSellingCampaign $campaign): array
    {
        return [
            'id' => $campaign->id,
            'location_id' => $campaign->location_id,
            'plu' => $campaign->plu,
            'product_name' => $campaign->product_name,
            'start_date' => $campaign->start_date?->toDateString(),
            'end_date' => $campaign->end_date?->toDateString(),
            'is_active' => $campaign->is_active,
            'created_by' => [
                'id' => $campaign->creator?->username ?? $campaign->created_by,
                'name' => $campaign->creator?->name ?? $campaign->created_by,
            ],
            'created_at' => $campaign->created_at?->toIso8601String(),
            'total_quantity' => null,
            'sales_available' => false,
        ];
    }

    private function integrationStatus(): array
    {
        return [
            'enabled' => (bool) config('beyond.enabled', false),
            'available' => false,
            'message' => 'Belum ada data dari Beyond.',
        ];
    }
}
