<?php
namespace App\Http\Controllers;
use App\Services\SupervisorCrewTaskExportService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class SupervisorCrewTaskExportController extends Controller
{
    public function __invoke(Request $request, SupervisorCrewTaskExportService $service)
    {
        abort_unless($request->user()->active && $request->user()->role_type==='supervisor',403);
        $data=$request->validate(['start'=>'required|date_format:Y-m-d','end'=>'required|date_format:Y-m-d|after_or_equal:start']);
        $name='penugasan-crew-'.$data['start'].'-'.$data['end'].'.xlsx';
        return response()->streamDownload(fn()=>$service->write($request->user(),Carbon::parse($data['start']),Carbon::parse($data['end']),'php://output'),$name,
            ['Content-Type'=>'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Content-Type-Options'=>'nosniff']);
    }
}
