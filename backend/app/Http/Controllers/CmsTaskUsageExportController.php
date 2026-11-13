<?php

namespace App\Http\Controllers;

use App\Services\TaskUsageReportService;
use App\Services\TaskUsageSpreadsheetService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CmsTaskUsageExportController extends Controller
{
    public function __invoke(
        Request $request,
        TaskUsageReportService $reportService,
        TaskUsageSpreadsheetService $spreadsheetService
    ) {
        $this->authorizeExport();
        $filters = $request->validate([
            'location' => ['nullable', 'string', 'exists:locations,initial'],
            'start_date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date', 'before_or_equal:today'],
            'sort_by' => ['required', Rule::in(['frequency', 'category', 'area', 'task'])],
            'sort_direction' => ['required', Rule::in(['asc', 'desc'])],
        ]);

        $start = Carbon::createFromFormat('Y-m-d', $filters['start_date']);
        $end = Carbon::createFromFormat('Y-m-d', $filters['end_date']);
        if ($start->diffInDays($end) > 365) {
            throw ValidationException::withMessages([
                'end_date' => ['Rentang ekspor maksimal 366 hari kalender.'],
            ]);
        }

        $location = $filters['location'] ?? 'semua-cabang';
        $filename = "penggunaan-master-task-{$location}-{$filters['start_date']}-{$filters['end_date']}.xlsx";

        return response()->streamDownload(
            fn() => $spreadsheetService->write($filters, $reportService, 'php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    private function authorizeExport(): void
    {
        $user = Auth::user();
        abort_if(!$user || $user->role_type !== 'superadmin', 403, 'Tidak memiliki akses.');
        abort_if(!$user->accountRole?->hasPermission('work_stations'), 403, 'Tidak memiliki akses.');
    }
}
