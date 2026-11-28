<?php
namespace Tests\Feature;

use App\Models\User;
use App\Services\ManagerScopeService;
use App\Services\UserNotificationService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;

class ManagerSupervisorTaskTest extends TaskCatalogAssignmentTest
{
    protected function setUp(): void
    {
        parent::setUp();
        (require database_path('migrations/2026_11_27_000001_create_manager_assignments_tables.php'))->up();
        DB::table('users')->insert(['username'=>'mgr-1','name'=>'Manager','active'=>true,'is_back_office'=>false]);
        DB::table('user_locations')->insert(['user_id'=>'mgr-1','job_level'=>'manager']);
        Schema::create('locations', function(Blueprint $table) { $table->id(); $table->string('initial'); $table->string('name'); });
        Schema::table('user_locations', function(Blueprint $table) { $table->string('location_id')->nullable(); });
        DB::table('locations')->insert([['initial'=>'A','name'=>'Cabang A'],['initial'=>'B','name'=>'Cabang B']]);
        DB::table('user_locations')->update(['location_id'=>'A']);
        DB::table('reporting_lines')->insert(['leader_id'=>'mgr-1','subordinate_id'=>'spv-1','status'=>'active','relation_type'=>'permanent']);
        $this->mock(UserNotificationService::class,function($mock) {
            $mock->shouldReceive('createAndPush')->andReturnNull();
            $mock->shouldReceive('createOrRefreshAggregateAndPush')->andReturnNull();
            $mock->shouldReceive('markAggregateRead')->andReturnNull();
            $mock->shouldReceive('refreshAggregate')->andReturnNull();
        });
        Storage::fake('local');
    }
    public function test_manager_activity_uses_the_same_authorized_supervisor_scope_as_assignments(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id(); $table->string('user_id'); $table->unsignedBigInteger('work_station_id')->nullable(); $table->string('action'); $table->timestamps();
        });
        Schema::create('job_levels',function(Blueprint $table){$table->id();$table->string('name');$table->string('grade')->nullable();});
        Schema::table('users',function(Blueprint $table){$table->unsignedBigInteger('job_level_id')->nullable();});
        $level=DB::table('job_levels')->insertGetId(['name'=>'CHIEF OPERATION','grade'=>'CO']);
        DB::table('users')->insert(['username'=>'co-1','name'=>'CO','active'=>true,'is_back_office'=>false,'job_level_id'=>$level]);
        DB::table('user_locations')->insert(['user_id'=>'co-1','job_level'=>'manager','location_id'=>'A']);
        DB::table('reporting_lines')->where('leader_id','mgr-1')->delete();
        DB::table('reporting_lines')->insert([
            ['leader_id'=>'mgr-1','subordinate_id'=>'co-1','status'=>'active','relation_type'=>'permanent'],
            ['leader_id'=>'co-1','subordinate_id'=>'spv-1','status'=>'active','relation_type'=>'permanent'],
        ]);
        DB::table('activity_logs')->insert(['user_id'=>'spv-1','action'=>'station_changed','created_at'=>'2026-10-09 09:00:00','updated_at'=>'2026-10-09 09:00:00']);
        $this->actingAs($this->actor(), 'sanctum')->getJson('/api/crew/activity-logs?user_id=spv-1&date=2026-10-09')->assertOk()->assertJsonCount(1);
        DB::table('user_locations')->where('user_id', 'spv-1')->update(['location_id'=>'B']);
        $this->getJson('/api/crew/activity-logs?user_id=spv-1&date=2026-10-09')->assertForbidden();
    }
    private function actor(string $id='mgr-1'): User {
        $user=User::where('username',$id)->firstOrFail(); $user->setRelation('accountRole',null); return $user;
    }
    private function payload(array $changes=[]): array {
        return array_replace(['task_context'=>'manager_supervisor','supervisor_id'=>'spv-1','title'=>'Pembagian tugas','target'=>'20 SC',
            'note'=>'Semua area','start_at'=>'2026-10-09 10:00:00','due_at'=>'2026-10-09 20:00:00'],$changes);
    }
    public function test_manager_creates_updates_lists_and_deletes_without_catalog(): void {
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->assertJsonPath('target','20 SC')->json();
        $this->patchJson('/api/manager/tasks/'.$task['id'],$this->payload(['target'=>'25']))->assertOk()->assertJsonPath('target','25');
        $this->getJson('/api/manager/supervisors/spv-1/tasks?date=2026-10-09&task_context=manager_supervisor')->assertOk();
        $this->deleteJson('/api/manager/tasks/'.$task['id'])->assertOk(); $this->assertDatabaseCount('manager_tasks',0);
    }
    public function test_scope_and_seven_day_window_are_enforced(): void {
        $this->actingAs($this->actor(),'sanctum');
        $this->postJson('/api/manager/tasks',$this->payload(['supervisor_id'=>'crew-1']))->assertForbidden();
        $this->postJson('/api/manager/tasks',$this->payload(['target'=>'']))->assertUnprocessable();
        $this->postJson('/api/manager/tasks',$this->payload(['start_at'=>'2026-10-15 08:00:00','due_at'=>'2026-10-15 20:00:00']))->assertCreated();
        $this->postJson('/api/manager/tasks',$this->payload(['start_at'=>'2026-10-16 08:00:00','due_at'=>'2026-10-16 20:00:00']))->assertUnprocessable();
        $this->actingAs($this->actor('crew-1'),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertForbidden();
    }
    public function test_bulk_recurrence_and_protected_occurrence(): void {
        $this->actingAs($this->actor(),'sanctum');
        $data=['task_context'=>'manager_supervisor','supervisor_ids'=>['spv-1','spv-1'],'title'=>'Arahan','target'=>'20',
            'start_date'=>'2026-10-10','end_date'=>'2026-10-11','repeat_days'=>[],'start_time'=>'08:00','due_time'=>'20:00'];
        $tasks=$this->postJson('/api/manager/tasks/bulk',$data)->assertCreated()->assertJsonPath('created',2)->json('tasks');
        DB::table('manager_task_evidences')->insert(['task_id'=>$tasks[0]['id'],'type'=>'after','file_path'=>'test.xlsx','attempt_no'=>1,'review_status'=>'pending']);
        $this->patchJson('/api/manager/task-batches/'.$tasks[0]['assignment_batch_id'],array_replace($data,['target'=>'30']))->assertOk()->assertJsonPath('protected',1);
        $this->assertDatabaseHas('manager_tasks',['id'=>$tasks[0]['id'],'target'=>'20']); $this->assertDatabaseHas('manager_tasks',['target'=>'30']);
        $this->deleteJson('/api/manager/tasks/'.$tasks[0]['id'])->assertStatus(400);
    }
    public function test_one_xlsx_no_before_and_authorized_download_approval(): void {
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->json();
        $book=new \PhpOffice\PhpSpreadsheet\Spreadsheet(); $file=tempnam(sys_get_temp_dir(),'spv-xlsx');
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($file);
        $result=$this->actingAs($this->actor('spv-1'),'sanctum')->post('/api/manager/tasks/'.$task['id'].'/evidence',[
            'after'=>[new UploadedFile($file,'tugas.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',null,true)]],['Accept'=>'application/json'])
            ->assertOk()->assertJsonPath('review_summary.can_approve',true)->json();
        $url='/api/manager/tasks/'.$task['id'].'/evidences/'.$result['evidences'][0]['id'].'/download';
        $this->get($url)->assertOk(); $this->actingAs($this->actor('crew-1'),'sanctum')->get($url)->assertForbidden();
        $this->actingAs($this->actor(),'sanctum')->patchJson('/api/manager/tasks/'.$task['id'].'/status',['status'=>'approved'])->assertOk();
        @unlink($file); $book->disconnectWorksheets();
    }
    public function test_exactly_three_single_file_attempts_and_no_pending_resubmit(): void {
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->json();
        for($attempt=1;$attempt<=3;$attempt++) {
            $this->actingAs($this->actor('spv-1'),'sanctum')->post('/api/manager/tasks/'.$task['id'].'/evidence',['after'=>[UploadedFile::fake()->image('proof.png')]],['Accept'=>'application/json'])
                ->assertOk()->assertJsonPath('review_summary.current_attempt',$attempt);
            $this->post('/api/manager/tasks/'.$task['id'].'/evidence',['after'=>[UploadedFile::fake()->image('proof.png')]],['Accept'=>'application/json'])->assertUnprocessable();
            $this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks/'.$task['id'].'/reject',['note'=>'Perbaiki bukti'])->assertOk();
        }
        $this->actingAs($this->actor('spv-1'),'sanctum')->post('/api/manager/tasks/'.$task['id'].'/evidence',['after'=>[UploadedFile::fake()->image('proof.png')]],['Accept'=>'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('manager_task_evidences',3);
    }
    public function test_invalid_evidence_is_rejected(): void {
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->json();
        $this->actingAs($this->actor('spv-1'),'sanctum');
        foreach ([['after'=>[UploadedFile::fake()->image('a.png'),UploadedFile::fake()->image('b.png')]],['before'=>[UploadedFile::fake()->image('a.png')]],
            ['after'=>[UploadedFile::fake()->createWithContent('a.xlsx','not a spreadsheet')]]] as $data)
            $this->post('/api/manager/tasks/'.$task['id'].'/evidence',$data,['Accept'=>'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('manager_task_evidences',0);
    }
    public function test_real_scope_denies_foreign_branch_even_with_active_reporting_line(): void {
        DB::table('user_locations')->where('user_id','spv-1')->update(['location_id'=>'B']);
        $this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertForbidden();
        $this->postJson('/api/manager/tasks/bulk',['task_context'=>'manager_supervisor','supervisor_ids'=>['spv-1'],'title'=>'Foreign','target'=>'x',
            'start_date'=>'2026-10-10','end_date'=>'2026-10-10','start_time'=>'08:00','due_time'=>'20:00'])->assertForbidden();
        $this->getJson('/api/manager/supervisors/spv-1/tasks?date=2026-10-09&task_context=manager_supervisor')->assertForbidden();
        $this->assertDatabaseCount('manager_tasks',0);
    }
    public function test_rm_only_assigned_branches(): void {
        DB::table('user_locations')->where('user_id','mgr-1')->update(['job_level'=>'regional_manager']);
        DB::table('user_locations')->where('user_id','spv-1')->update(['location_id'=>'B']);
        $this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertForbidden();
        DB::table('user_locations')->insert(['user_id'=>'mgr-1','job_level'=>'regional_manager','location_id'=>'B']);
        $this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated();
    }

    public function test_co_can_assign_through_current_manager_scope(): void {
        Schema::create('job_levels',function(Blueprint $table){$table->id();$table->string('name');$table->string('grade')->nullable();});
        Schema::table('users',function(Blueprint $table){$table->unsignedBigInteger('job_level_id')->nullable();});
        $level=DB::table('job_levels')->insertGetId(['name'=>'CHIEF OPERATION','grade'=>'CO']);
        DB::table('users')->where('username','mgr-1')->update(['job_level_id'=>$level]);
        $manager=$this->actor();$this->assertSame('CO',$manager->manager_type);
        $this->actingAs($manager,'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated();
    }
    public function test_lost_branch_scope_blocks_review_download_and_mutation(): void {
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->json();
        $evidence=DB::table('manager_task_evidences')->insertGetId(['task_id'=>$task['id'],'file_path'=>'tasks/private.xlsx','type'=>'after','attempt_no'=>1,'review_status'=>'pending']);
        Storage::disk('local')->put('tasks/private.xlsx','private fixture');
        DB::table('user_locations')->where('user_id','spv-1')->update(['location_id'=>'B']);
        $this->actingAs($this->actor(),'sanctum');
        $this->patchJson('/api/manager/tasks/'.$task['id'].'/status',['status'=>'approved'])->assertForbidden();
        $this->patchJson('/api/manager/tasks/'.$task['id'],$this->payload())->assertForbidden();
        $this->get('/api/manager/tasks/'.$task['id'].'/evidences/'.$evidence.'/download')->assertForbidden();
        $this->deleteJson('/api/manager/tasks/'.$task['id'])->assertForbidden();
    }

    public function test_sm_assigns_through_co_without_inventing_reporting_line(): void {
        Schema::create('job_levels',function(Blueprint $table){$table->id();$table->string('name');$table->string('grade')->nullable();});
        Schema::table('users',function(Blueprint $table){$table->unsignedBigInteger('job_level_id')->nullable();});
        $level=DB::table('job_levels')->insertGetId(['name'=>'CHIEF OPERATION','grade'=>'CO']);
        DB::table('users')->insert(['username'=>'co-1','name'=>'CO','active'=>true,'is_back_office'=>false,'job_level_id'=>$level]);
        DB::table('user_locations')->insert(['user_id'=>'co-1','job_level'=>'manager','location_id'=>'A']);
        DB::table('reporting_lines')->where('leader_id','mgr-1')->where('subordinate_id','spv-1')->delete();
        DB::table('reporting_lines')->insert([
            ['leader_id'=>'mgr-1','subordinate_id'=>'co-1','status'=>'active','relation_type'=>'permanent'],
            ['leader_id'=>'co-1','subordinate_id'=>'spv-1','status'=>'active','relation_type'=>'permanent'],
        ]);
        $this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated();
        $this->assertDatabaseCount('manager_tasks',1);$this->assertDatabaseCount('tasks',0);
        $this->assertDatabaseMissing('reporting_lines',['leader_id'=>'mgr-1','subordinate_id'=>'spv-1']);
        DB::table('reporting_lines')->where('leader_id','co-1')->delete();
        $this->assertDatabaseCount('manager_tasks',1);
    }
    public function test_overlapping_crew_and_manager_task_ids_stay_separate(): void {
        $crew=\App\Models\Task::create(['employee_id'=>'crew-1','employer_id'=>'spv-1','title'=>'Crew original','assignment_type'=>'individual',
            'start_at'=>'2026-10-09 10:00:00','due_at'=>'2026-10-09 20:00:00','status'=>'pending']);
        $task=$this->actingAs($this->actor(),'sanctum')->postJson('/api/manager/tasks',$this->payload())->assertCreated()->json();
        $this->assertSame($crew->id,$task['id']);
        $this->patchJson('/api/manager/tasks/'.$task['id'],$this->payload(['title'=>'Manager updated']))->assertOk();
        $this->assertDatabaseHas('tasks',['id'=>$crew->id,'title'=>'Crew original']);
        $this->actingAs($this->actor('spv-1'),'sanctum')->getJson('/api/supervisor/manager-tasks?date=2026-10-09')->assertOk()->assertJsonCount(1);
    }

    public function test_manager_tasks_receive_start_and_deadline_reminders(): void {
        \App\Models\ManagerTask::create(['employee_id'=>'spv-1','employer_id'=>'mgr-1','title'=>'Soon','target'=>'Ready',
            'assignment_type'=>'individual','start_at'=>'2026-10-09 10:05:00','due_at'=>'2026-10-09 10:20:00',
            'approval_deadline_at'=>'2026-10-09 23:59:59','revision_deadline_at'=>'2026-10-09 23:29:59','status'=>'pending']);
        $this->mock(UserNotificationService::class,function($mock){
            $mock->shouldReceive('createAndPush')->twice()->withArgs(function(...$args){
                return $args[0]==='spv-1' && str_starts_with($args[5]['tag'],'manager-');
            });
        });
        $this->artisan('notifications:dispatch-tasks')->assertExitCode(0);
    }

    public function test_migration_preserves_crew_schema_and_uses_account_foreign_keys(): void {
        $this->assertFalse(Schema::hasColumn('tasks','target'));
        $this->assertFalse(Schema::hasColumn('tasks','task_context'));
        $keys=DB::select("PRAGMA foreign_key_list('manager_tasks')");
        $tables=array_unique(array_map(fn($key)=>$key->table,$keys));
        $this->assertContains('users',$tables);$this->assertNotContains('reporting_lines',$tables);
        \App\Models\Task::create(['employee_id'=>'crew-1','employer_id'=>'spv-1','title'=>'Keep me','assignment_type'=>'individual',
            'start_at'=>'2026-10-09 10:00:00','due_at'=>'2026-10-09 20:00:00','status'=>'pending']);
        (require database_path('migrations/2026_11_27_000001_create_manager_assignments_tables.php'))->down();
        $this->assertDatabaseHas('tasks',['title'=>'Keep me']);$this->assertFalse(Schema::hasTable('manager_tasks'));
    }

    public function test_manager_inbox_rejects_crew_work_station_filter(): void {
        \App\Models\WorkStation::create(['name'=>'sc','active'=>true]);
        $this->actingAs($this->actor('spv-1'),'sanctum')->getJson('/api/supervisor/manager-tasks?role=sc')->assertUnprocessable();
    }

    public function test_manager_task_messages_use_manager_and_evidence_wording(): void
    {
        $events = [];
        $this->mock(UserNotificationService::class, function ($mock) use (&$events) {
            $mock->shouldReceive('createAndPush')
                ->andReturnUsing(function (...$args) use (&$events) {
                    $events[] = ['type' => $args[1], 'title' => $args[2], 'message' => $args[3]];
                    return null;
                });
            $mock->shouldReceive('createOrRefreshAggregateAndPush')->andReturnNull();
            $mock->shouldReceive('markAggregateRead')->andReturnNull();
            $mock->shouldReceive('refreshAggregate')->andReturnNull();
        });

        $task = $this->actingAs($this->actor(), 'sanctum')
            ->postJson('/api/manager/tasks', $this->payload())
            ->assertCreated()
            ->json();

        $this->patchJson('/api/manager/tasks/' . $task['id'] . '/status', ['status' => 'approved'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status')
            ->assertJsonPath(
                'errors.status.0',
                'Tugas hanya dapat disetujui setelah bukti tugas yang menunggu pemeriksaan tersedia.'
            );

        $this->actingAs($this->actor('spv-1'), 'sanctum')
            ->post('/api/manager/tasks/' . $task['id'] . '/evidence', [
                'after' => [UploadedFile::fake()->image('proof.png')],
            ], ['Accept' => 'application/json'])
            ->assertOk();

        $this->actingAs($this->actor(), 'sanctum')
            ->patchJson('/api/manager/tasks/' . $task['id'] . '/status', ['status' => 'approved'])
            ->assertOk();

        $approvedEvent = collect($events)->firstWhere('type', 'task_status');
        $this->assertNotNull($approvedEvent);
        $this->assertStringContainsString('oleh manager.', $approvedEvent['message']);
        $this->assertStringNotContainsString('oleh supervisor.', $approvedEvent['message']);

        $unstartedTask = $this->actingAs($this->actor(), 'sanctum')
            ->postJson('/api/manager/tasks', $this->payload(['title' => 'Hapus manager task']))
            ->assertCreated()
            ->json();

        $this->deleteJson('/api/manager/tasks/' . $unstartedTask['id'])
            ->assertOk();

        $deletedEvent = collect($events)->firstWhere('type', 'task_deleted');
        $this->assertNotNull($deletedEvent);
        $this->assertStringContainsString('oleh manager.', $deletedEvent['message']);
        $this->assertStringNotContainsString('oleh supervisor.', $deletedEvent['message']);

        $hardeningMigration = require database_path('migrations/2026_11_27_000002_harden_manager_assignments_indexes_and_constraints.php');
        $hardeningMigration->up();
        $hardeningMigration->down();
    }

}
