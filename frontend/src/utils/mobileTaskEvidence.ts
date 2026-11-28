interface EvidenceAccessTask {
    start_at?: string | null;
    due_at: string;
    status: string;
    _selected_date?: string;
    evidences?: { type: string }[];
    review_summary?: { can_upload_after: boolean };
}

// Same policy for crew and supervisor. The server owns revision-window permissions.
export function getMobileEvidenceAccess(task: EvidenceAccessTask, { resultOnly = false, readOnly = false, now = new Date() } = {}) {
    const isPastDue = new Date(task.due_at) < now;
    const isBeforeStart = Boolean(task.start_at && new Date(task.start_at) > now);
    const isNonTodayView = Boolean(task._selected_date && task._selected_date !== now.toLocaleDateString('en-CA'));
    const baseReadOnly = readOnly || task.status === 'approved' || isBeforeStart || isNonTodayView;
    const beforeCount = task.evidences?.filter(evidence => evidence.type === 'before').length || 0;
    const afterCount = task.evidences?.filter(evidence => evidence.type === 'after').length || 0;
    const canUploadBefore = !resultOnly && !baseReadOnly && !isPastDue && beforeCount === 0;
    const canUploadAfter = !baseReadOnly && (task.review_summary ? task.review_summary.can_upload_after : !isPastDue && afterCount < 3);
    return { canUploadBefore, canUploadAfter, isBeforeStart, isReadOnly: baseReadOnly || (!canUploadBefore && !canUploadAfter) };
}
