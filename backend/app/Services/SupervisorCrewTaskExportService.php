<?php
namespace App\Services;

use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class SupervisorCrewTaskExportService
{
    public function __construct(private SupervisorTaskAccessService $access) {}

    public function write(User $supervisor, Carbon $start, Carbon $end, string $destination): void
    {
        abort_unless($supervisor->active && $supervisor->role_type === 'supervisor', 403);
        $crewIds=$supervisor->subordinateLines()->where('status','active')->with('subordinate.userLocations')->get()
            ->pluck('subordinate')->filter(fn($crew)=>$crew && $crew->active && in_array($crew->role_type,['employee','crew'],true))->pluck('username');
        $permanent=$supervisor->subordinateLines()->where('status','active')->where('relation_type','permanent')->pluck('subordinate_id')->all();
        $book=new Spreadsheet(); $sheet=$book->getActiveSheet(); $sheet->setTitle('Penugasan Crew');
        $sheet->fromArray(['Tanggal','NIK Crew','Nama Crew','Kategori','Area','Task','Jam Mulai','Deadline','Deskripsi'],null,'A1');
        $number=2; $backupByDate=[];
        $tasks=Task::with(['assignedTo','taskDefinition.taskArea.workStation','workStation'])
            ->whereIn('employee_id',$crewIds)
            ->where(function($query)use($start,$end){
                $query->whereBetween('start_at',[$start->copy()->startOfDay(),$end->copy()->endOfDay()])
                    ->orWhere(function($legacy)use($start,$end){$legacy->whereNull('start_at')
                        ->where('created_at','<=',$end->copy()->endOfDay())->where('due_at','>=',$start->copy()->startOfDay());});
            })->orderByRaw('COALESCE(start_at, created_at)')->orderBy('employee_id')->orderBy('id')->lazy(500);
        try {
            foreach($tasks as $task) {
                // Legacy tasks may span dates. Export one occurrence on each day, as the task list does.
                $first=$task->start_at ? Carbon::parse($task->start_at)->startOfDay() : Carbon::parse($task->created_at)->startOfDay()->max($start);
                $last=$task->start_at ? $first->copy() : Carbon::parse($task->due_at)->startOfDay()->min($end);
                for($date=$first->copy();$date->lte($last);$date->addDay()) {
                    $key=$date->toDateString();
                    if(!isset($backupByDate[$key])) $backupByDate[$key]=$this->access->reviewableBackupPairs($supervisor,$crewIds,$date);
                    $allowed=$task->employer_id===$supervisor->username || in_array($task->employee_id,$permanent,true)
                        || $backupByDate[$key]->contains(fn($pair)=>$pair['crew_id']===$task->employee_id && $pair['requester_id']===$task->employer_id);
                    if(!$allowed) continue;
                    $area=$task->taskDefinition?->taskArea;
                    $values=[$key,$task->employee_id,$task->assignedTo?->name ?? '',$area?->workStation?->name ?? $task->workStation?->name ?? '',
                        $area?->name ?? '',$task->title,$task->start_at?->format('H:i') ?? '',$task->due_at?->format('Y-m-d H:i') ?? '',$task->description ?? ''];
                    foreach($values as $index=>$value) $sheet->setCellValueExplicit(Coordinate::stringFromColumnIndex($index+1).$number,(string)$value,DataType::TYPE_STRING);
                    $number++;
                }
            }
            $sheet->getStyle('A1:I1')->getFont()->setBold(true);
            $sheet->freezePane('A2'); $sheet->setAutoFilter('A1:I'.max(1,$number-1));
            foreach(range('A','I') as $column) $sheet->getColumnDimension($column)->setAutoSize(true);
            (new Xlsx($book))->save($destination);
        } finally { $book->disconnectWorksheets(); }
    }
}
