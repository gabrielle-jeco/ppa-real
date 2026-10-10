<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'employer_id',
        'work_station_id',
        'task_definition_id',
        'assignment_batch_id',
        'assignment_type',
        'title',
        'description',
        'start_at',
        'due_at',
        'approval_deadline_at',
        'revision_deadline_at',
        'weight_label',
        'weight_value',
        'status',
    ];

    protected $casts = [
        'start_at' => 'datetime',
        'due_at' => 'datetime',
        'approval_deadline_at' => 'datetime',
        'revision_deadline_at' => 'datetime',
    ];

    protected $appends = ['task_id', 'manager_id', 'note', 'review_summary'];

    public function scopeActiveOnDate(Builder $query, Carbon|string $date): Builder
    {
        $targetDate = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);

        return $query->where(function (Builder $scope) use ($targetDate) {
            $scope->where(function (Builder $batchTask) use ($targetDate) {
                $batchTask->whereNotNull('assignment_batch_id')
                    ->whereDate('start_at', $targetDate->toDateString());
            })->orWhere(function (Builder $individualTask) use ($targetDate) {
                $individualTask->whereNull('assignment_batch_id')
                    ->where(function (Builder $datedTask) use ($targetDate) {
                        $datedTask->where(function (Builder $taskWithStart) use ($targetDate) {
                            $taskWithStart->whereNotNull('start_at')
                                ->whereDate('start_at', $targetDate->toDateString());
                        })->orWhere(function (Builder $legacyTask) use ($targetDate) {
                            $legacyTask->whereNull('start_at')
                                ->where('created_at', '<=', $targetDate->copy()->endOfDay())
                                ->where('due_at', '>=', $targetDate->copy()->startOfDay());
                        });
                    });
            });
        });
    }

    public function scopeAwaitingReview(Builder $query): Builder
    {
        return $query->where(function (Builder $workflow) {
            $workflow->where(function (Builder $legacy) {
                $legacy->whereNull('revision_deadline_at')
                    ->whereIn('status', ['pending', 'rejected'])
                    ->whereHas('evidences');
            })->orWhere(function (Builder $revision) {
                $revision->whereNotNull('revision_deadline_at')
                    ->where('status', 'pending')
                    ->whereHas('evidences', function (Builder $evidence) {
                        $evidence->where('type', 'after')
                            ->where('review_status', 'pending');
                    });
            });
        });
    }

    public function getTaskIdAttribute()
    {
        return $this->id;
    }

    public function getManagerIdAttribute()
    {
        return $this->employer_id;
    }

    public function getNoteAttribute()
    {
        return $this->description;
    }

    public function getReviewSummaryAttribute(): ?array
    {
        if (!$this->revision_deadline_at || !$this->relationLoaded('evidences')) {
            return null;
        }

        $afterEvidences = $this->evidences
            ->where('type', 'after')
            ->whereNotNull('attempt_no')
            ->sortBy('attempt_no');
        $latestAfter = $afterEvidences->last();
        $attemptNo = (int) ($latestAfter?->attempt_no ?? 0);
        $maxAttempts = (int) config('task_review.max_after_attempts', 3);
        $attemptScores = config('task_review.attempt_scores', [1 => 100, 2 => 67, 3 => 50]);
        $approvalDeadline = Carbon::parse($this->approval_deadline_at);
        $revisionDeadline = Carbon::parse($this->revision_deadline_at);
        $rejectDeadline = $attemptNo >= $maxAttempts
            ? $approvalDeadline->copy()
            : $revisionDeadline->copy()->subMinutes((int) config('task_review.minimum_revision_window_minutes', 30));
        $nextAttempt = min($attemptNo + 1, $maxAttempts);
        $hasBefore = $this->evidences->contains('type', 'before');
        $potentialScore = 0;

        if ($hasBefore && $latestAfter?->review_status === 'approved') {
            $potentialScore = (float) ($latestAfter->awarded_score ?? ($attemptScores[$attemptNo] ?? 0));
        } elseif ($hasBefore && $latestAfter?->review_status === 'pending') {
            $potentialScore = (float) ($attemptScores[$attemptNo] ?? 0);
        } elseif ($hasBefore && $latestAfter?->review_status === 'rejected' && $attemptNo < $maxAttempts) {
            $potentialScore = (float) ($attemptScores[$nextAttempt] ?? 0);
        }

        $canUploadAfter = !$latestAfter
            ? Carbon::now()->lte(Carbon::parse($this->due_at))
            : $latestAfter->review_status === 'rejected'
                && $attemptNo < $maxAttempts
                && Carbon::now()->lte($revisionDeadline);
        $canReject = $latestAfter?->review_status === 'pending'
            && $this->status !== 'approved'
            && Carbon::now()->lte($rejectDeadline);
        $canUploadAfter = $this->status !== 'approved' && $canUploadAfter;

        return [
            'current_attempt' => $attemptNo,
            'max_attempts' => $maxAttempts,
            'latest_after_status' => $latestAfter?->review_status,
            'potential_score' => $potentialScore,
            'score_after_reject' => !$hasBefore || $attemptNo >= $maxAttempts
                ? 0
                : (float) ($attemptScores[$nextAttempt] ?? 0),
            'reject_deadline_at' => $rejectDeadline->toIso8601String(),
            'can_reject' => $canReject,
            'can_approve' => $hasBefore
                && $latestAfter?->review_status === 'pending'
                && Carbon::now()->lte($approvalDeadline),
            'can_upload_after' => $canUploadAfter,
            'can_delete' => $canReject || $canUploadAfter,
        ];
    }

    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'employee_id', 'username');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'employer_id', 'username');
    }

    public function workStation()
    {
        return $this->belongsTo(WorkStation::class);
    }

    public function taskDefinition()
    {
        return $this->belongsTo(TaskDefinition::class);
    }

    public function assignmentBatch()
    {
        return $this->belongsTo(TaskAssignmentBatch::class, 'assignment_batch_id');
    }

    public function evidences()
    {
        return $this->hasMany(TaskEvidence::class);
    }
}
