<?php

namespace App\Http\Controllers;

use App\Services\CmsScoreReportService;
use App\Services\ScoreReportSpreadsheetService;
use App\Services\ScoreReportScopeService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class CmsScoreReportController extends Controller
{
    public function __construct(private ScoreReportScopeService $reportScope)
    {
    }

    public function options()
    {
        return response()->json($this->reportScope->managerOptions($this->authorizeReport()));
    }

    public function index(string $mode, Request $request, CmsScoreReportService $service)
    {
        $user = $this->authorizeReport();
        $filters = $this->validatedFilters($mode, $request, $user);

        return response()->json($service->report($mode, $filters, (int) $request->input('page', 1)));
    }

    public function details(string $mode, Request $request, CmsScoreReportService $service)
    {
        $user = $this->authorizeReport();
        $filters = $this->validatedFilters($mode, $request, $user);
        $request->validate([
            'location_id' => ['required', 'string', 'exists:locations,initial'],
            'leader_id' => ['nullable', 'string', 'exists:users,username'],
        ]);

        return response()->json([
            'rows' => $service->details(
                $mode,
                $filters,
                $request->input('leader_id'),
                $request->string('location_id')->toString()
            ),
        ]);
    }

    public function export(
        string $mode,
        Request $request,
        CmsScoreReportService $service,
        ScoreReportSpreadsheetService $spreadsheetService
    ) {
        $user = $this->authorizeReport();
        $filters = $this->validatedFilters($mode, $request, $user);
        $filename = 'report-penilaian-' . $mode . '-' . $filters['start'] . '-' . $filters['end'] . '.xlsx';

        return response()->streamDownload(
            fn() => $spreadsheetService->write($mode, $filters, $service, 'php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    private function validatedFilters(string $mode, Request $request, User $user): array
    {
        abort_unless(in_array($mode, ['daily', 'monthly'], true), 404);

        $common = $request->validate([
            'regional' => ['nullable', 'string', 'exists:regional,kode_regional'],
            'location' => ['nullable', 'string', 'exists:locations,initial'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        if ($mode === 'daily') {
            $period = $request->validate([
                'start' => ['required', 'date_format:Y-m-d'],
                'end' => ['required', 'date_format:Y-m-d', 'after_or_equal:start', 'before_or_equal:today'],
            ]);
            $start = Carbon::createFromFormat('Y-m-d', $period['start'])->startOfDay();
            $end = Carbon::createFromFormat('Y-m-d', $period['end'])->startOfDay();
            if ($start->diffInDays($end) > 30) {
                throw ValidationException::withMessages(['end' => ['Rentang penilaian harian maksimal 31 hari kalender.']]);
            }
        } else {
            $period = $request->validate([
                'start' => ['required', 'date_format:Y-m'],
                'end' => ['required', 'date_format:Y-m'],
            ]);
            $start = Carbon::createFromFormat('Y-m', $period['start'])->startOfMonth();
            $end = Carbon::createFromFormat('Y-m', $period['end'])->startOfMonth();
            if ($end->lt($start)) {
                throw ValidationException::withMessages(['end' => ['Bulan selesai tidak boleh lebih awal dari bulan mulai.']]);
            }
            if ($start->diffInMonths($end) > 11) {
                throw ValidationException::withMessages(['end' => ['Rentang penilaian bulanan maksimal 12 bulan.']]);
            }
            if ($end->gt(Carbon::now()->subMonthNoOverflow()->startOfMonth())) {
                throw ValidationException::withMessages(['end' => ['Penilaian bulanan hanya tersedia untuk bulan yang sudah selesai.']]);
            }
        }

        $common = $this->reportScope->filters($user, $common);
        if (!empty($common['location']) && !empty($common['regional'])) {
            $belongsToRegional = app(CmsScoreReportService::class)->locations($common)
                ->contains('initial', $common['location']);
            if (!$belongsToRegional) {
                throw ValidationException::withMessages(['location' => ['Cabang tidak termasuk dalam regional yang dipilih.']]);
            }
        }

        return [
            'regional' => $common['regional'] ?? null,
            'location' => $common['location'] ?? null,
            'start' => $period['start'],
            'end' => $period['end'],
        ];
    }

    private function authorizeReport(): User
    {
        $user = Auth::user();
        abort_unless($user && ($user->role_type === 'manager'
            || ($user->role_type === 'superadmin' && $user->accountRole?->hasPermission('score_reports'))), 403, 'Tidak memiliki akses.');

        return $user;
    }
}
