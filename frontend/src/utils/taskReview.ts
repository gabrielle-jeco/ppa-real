import { getTaskApprovalDeadline } from './taskTiming';

export type TaskReviewSummary = {
    current_attempt: number;
    max_attempts: number;
    latest_after_status: 'pending' | 'approved' | 'rejected' | null;
    potential_score: number;
    score_after_reject: number;
    reject_deadline_at: string;
    can_reject: boolean;
    can_approve: boolean;
    can_upload_after: boolean;
    can_delete: boolean;
};

export const getTaskReviewSummary = (task: any): TaskReviewSummary | null => (
    task?.review_summary || null
);

export const canToggleTaskApproval = (task: any, now = new Date()) => {
    const approvalDeadline = getTaskApprovalDeadline(task);
    if (!approvalDeadline || approvalDeadline.getTime() < now.getTime()) return false;
    if (task?.status === 'approved') return true;

    const review = getTaskReviewSummary(task);
    return review ? review.can_approve : true;
};

export const canRejectTask = (task: any, now = new Date()) => {
    const review = getTaskReviewSummary(task);
    if (!review?.can_reject || task?.status === 'approved') return false;

    const deadline = new Date(review.reject_deadline_at);
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= now.getTime();
};

export const canDeleteTask = (task: any, now = new Date()) => {
    if (task?.status === 'approved') return false;

    const dueAt = new Date(task?.due_at);
    const isBeforeDue = !Number.isNaN(dueAt.getTime()) && dueAt.getTime() >= now.getTime();
    if (task?.assignment_batch_id) {
        return isBeforeDue && (task?.evidences || []).length === 0;
    }

    const review = getTaskReviewSummary(task);
    return review ? review.can_delete : isBeforeDue;
};
