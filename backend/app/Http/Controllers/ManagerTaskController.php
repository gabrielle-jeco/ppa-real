<?php
namespace App\Http\Controllers;

use App\Models\ManagerTask;
use App\Models\ManagerTaskAssignmentBatch;
use Illuminate\Http\Request;

class ManagerTaskController extends TaskController
{
    protected function taskModel(): string { return ManagerTask::class; }
    protected function batchModel(): string { return ManagerTaskAssignmentBatch::class; }
    protected function isManagerTaskEndpoint(): bool { return true; }

    public function mine(Request $request)
    {
        abort_unless($request->user()->active && $request->user()->role_type === 'supervisor', 403);
        return $this->index($request, $request->user()->username);
    }
}
