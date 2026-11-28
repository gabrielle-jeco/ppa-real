<?php
namespace Tests\Feature;
use App\Models\User;
use App\Models\Task;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\IOFactory;

class SupervisorCrewTaskExportTest extends TaskCatalogAssignmentTest
{
    public function test_export_scope_dates_and_safe_text_cells(): void
    {
        DB::table('users')->where('username','crew-1')->update(['name'=>'=DANGEROUS()']);
        $base=['employee_id'=>'crew-1','employer_id'=>'spv-1','assignment_type'=>'individual','title'=>'Task','description'=>null,'start_at'=>'2026-10-10 08:00:00','due_at'=>'2026-10-10 20:00:00','status'=>'pending'];
        Task::create($base);
        Task::create(array_replace($base,['start_at'=>'2026-10-11 08:00:00','due_at'=>'2026-10-11 20:00:00']));
        Task::create(array_replace($base,['employee_id'=>'spv-1','task_context'=>'manager_supervisor']));
        DB::table('users')->insert([
            ['username'=>'000001','name'=>'Crew kedua','active'=>true,'is_back_office'=>false],
            ['username'=>'outside','name'=>'Crew luar','active'=>true,'is_back_office'=>false],
        ]);
        DB::table('user_locations')->insert([['user_id'=>'000001','job_level'=>'sc'],['user_id'=>'outside','job_level'=>'sc']]);
        DB::table('reporting_lines')->insert(['leader_id'=>'spv-1','subordinate_id'=>'000001','status'=>'active','relation_type'=>'permanent']);
        $station=\App\Models\WorkStation::create(['name'=>'Kategori QA','active'=>true]);
        $area=\App\Models\TaskArea::create(['work_station_id'=>$station->id,'name'=>'Area QA','active'=>true,'sort_order'=>0]);
        $definition=\App\Models\TaskDefinition::create(['task_area_id'=>$area->id,'title'=>'Task kedua','active'=>true,'sort_order'=>0]);
        Task::create(array_replace($base,['employee_id'=>'000001','title'=>'Task kedua','description'=>'Catatan QA','task_definition_id'=>$definition->id,'work_station_id'=>$station->id]));
        Task::create(array_replace($base,['employee_id'=>'outside']));
        $spv=User::where('username','spv-1')->firstOrFail(); $spv->setRelation('accountRole',null);
        $response=$this->actingAs($spv,'sanctum')->get('/api/supervisor/crew-tasks/export?start=2026-10-10&end=2026-10-10')->assertOk();
        $file=tempnam(sys_get_temp_dir(),'crew-export'); file_put_contents($file,$response->streamedContent());
        try {
            $book=IOFactory::load($file); $sheet=$book->getActiveSheet();
            $this->assertSame(3,$sheet->getHighestRow());
            $this->assertSame('Tanggal',$sheet->getCell('A1')->getValue());
            $this->assertSame('=DANGEROUS()',$sheet->getCell('C3')->getValue());
            $this->assertSame('s',$sheet->getCell('C3')->getDataType());
            $this->assertSame('Task',$sheet->getCell('F3')->getValue());
            $this->assertSame('000001',$sheet->getCell('B2')->getValue());
            $this->assertSame('s',$sheet->getCell('B2')->getDataType());
            $this->assertSame('Kategori QA',$sheet->getCell('D2')->getValue());
            $this->assertSame('Area QA',$sheet->getCell('E2')->getValue());
            $this->assertSame('Catatan QA',$sheet->getCell('I2')->getValue());
            $book->disconnectWorksheets();
        } finally { @unlink($file); }
        $this->get('/api/supervisor/crew-tasks/export?start=2026-10-11&end=2026-10-10',['Accept'=>'application/json'])->assertUnprocessable();
        $crew=User::where('username','crew-1')->firstOrFail(); $crew->setRelation('accountRole',null);
        $this->actingAs($crew,'sanctum')->get('/api/supervisor/crew-tasks/export?start=2026-10-10&end=2026-10-10')->assertForbidden();
    }
    public function test_backup_exports_only_source_spv_tasks_during_approved_period(): void
    {
        DB::table('users')->insert(['username'=>'backup-crew','name'=>'Backup Crew','active'=>true,'is_back_office'=>false]);
        DB::table('user_locations')->insert(['user_id'=>'backup-crew','job_level'=>'sc']);
        DB::table('reporting_lines')->insert([
            ['leader_id'=>'spv-1','subordinate_id'=>'backup-crew','status'=>'active','relation_type'=>'backup'],
            ['leader_id'=>'original-spv','subordinate_id'=>'backup-crew','status'=>'active','relation_type'=>'permanent'],
        ]);
        $request=DB::table('supervisor_backup_requests')->insertGetId(['requester_id'=>'original-spv','backup_supervisor_id'=>'spv-1',
            'start_date'=>'2026-10-10','end_date'=>'2026-10-10','status'=>'approved']);
        DB::table('supervisor_backup_assignments')->insert(['backup_request_id'=>$request,'subordinate_id'=>'backup-crew','created_temporary_line'=>true]);
        DB::table('reporting_lines')->where('leader_id','spv-1')->where('subordinate_id','backup-crew')->update(['backup_request_id'=>$request,'effective_from'=>'2026-10-10','effective_until'=>'2026-10-10']);
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-10-10 10:00:00','Asia/Jakarta'));
        foreach(['2026-10-10','2026-10-11'] as $date) foreach(['original-spv','unrelated-spv'] as $owner)
            Task::create(['employee_id'=>'backup-crew','employer_id'=>$owner,'assignment_type'=>'individual','title'=>$owner,
                'start_at'=>$date.' 08:00:00','due_at'=>$date.' 20:00:00','status'=>'pending']);
        $spv=User::where('username','spv-1')->firstOrFail(); $spv->setRelation('accountRole',null);
        $response=$this->actingAs($spv,'sanctum')->get('/api/supervisor/crew-tasks/export?start=2026-10-10&end=2026-10-11')->assertOk();
        $file=tempnam(sys_get_temp_dir(),'backup-export');file_put_contents($file,$response->streamedContent());
        try {
            $book=IOFactory::load($file);$sheet=$book->getActiveSheet();
            $this->assertSame(2,$sheet->getHighestRow());$this->assertSame('2026-10-10',$sheet->getCell('A2')->getValue());
            $this->assertSame('original-spv',$sheet->getCell('F2')->getValue());$book->disconnectWorksheets();
        } finally { @unlink($file); }
    }

}
