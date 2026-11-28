import { evidenceUploadErrorFromResponse } from './evidenceUploadError.ts';
export interface AssignmentFormValues {
    title: string; target: string; note: string; startDate: string; endDate: string;
    startTime: string; dueTime: string; repeatDays: number[]; supervisorIds: string[];
}
export interface AssignmentEvidence {
    id: number; file_path: string; attempt_no: number; review_status: string;
    rejection_reason?: string; reviewed_at?: string;
}
export interface SupervisorAssignment {
    id: number; title: string; target: string; description?: string; start_at: string; due_at: string; status: string; approval_deadline_at?: string;
    assignment_batch_id?: number; assignment_batch?: {id: number; supervisor_ids: string[]; start_date: string; end_date: string; start_time: string; due_time: string; repeat_days: number[]; title: string; target: string; description?: string};
    evidences: AssignmentEvidence[];
    review_summary?: {potential_score?: number; score_after_reject?: number; reject_deadline_at?: string; current_attempt: number; max_attempts: number; can_upload_after: boolean; can_approve: boolean; can_reject: boolean; can_delete: boolean};
}
export interface AssignmentRecipient { id: string; name: string; location?: string; role?: string }
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function buildManagerTaskPayload(values: AssignmentFormValues, bulk: boolean) {
    const shared = {task_context:'manager_supervisor',title:values.title.trim(),target:values.target.trim(),note:values.note.trim()};
    return bulk ? {...shared,supervisor_ids:values.supervisorIds,start_date:values.startDate,end_date:values.endDate,
        repeat_days:values.repeatDays,start_time:values.startTime,due_time:values.dueTime}
        : {...shared,supervisor_id:values.supervisorIds[0],start_at:`${values.startDate} ${values.startTime}:00`,due_at:`${values.startDate} ${values.dueTime}:00`};
}
export function validateEvidenceFile(file: {name: string; size: number}): string | null {
    if (!/\.(jpe?g|png|webp|xlsx)$/i.test(file.name)) return 'Pilih foto JPG, PNG, WebP atau file XLSX.';
    return file.size > 10*1024*1024 ? 'Ukuran bukti maksimal 10 MB.' : null;
}
export function validateAssignmentSchedule(start: string, end: string, startTime: string, dueTime: string, now = new Date()): string | null {
    const limit = new Date(now); limit.setDate(limit.getDate()+6);
    if (!start || !end || start < localDate(now) || end < start || end > localDate(limit)) return 'Pilih tanggal dalam tujuh hari berjalan.';
    if (!startTime || !dueTime || dueTime < startTime) return 'Tenggat tidak boleh lebih awal dari jam mulai.';
    if (new Date(`${start}T${dueTime}:00`) < now) return 'Tenggat tidak boleh berada di masa lalu.';
    return null;
}
export const taskHeaders = () => ({Authorization:`Bearer ${localStorage.getItem('auth_token')}`,Accept:'application/json'});
export async function assignmentRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {...init, headers:{...taskHeaders(),...(init.body instanceof FormData ? {} : {'Content-Type':'application/json'}),...init.headers}});
    if (!response.ok && init.body instanceof FormData) throw await evidenceUploadErrorFromResponse(response);
    let payload;
    try { payload = await response.json(); }
    catch {
        throw new Error(`Respons server tidak valid (HTTP ${response.status}). Muat ulang daftar tugas untuk memeriksa apakah perubahan sudah tersimpan sebelum mencoba lagi.`);
    }
    if (!response.ok) throw new Error(Object.values(payload.errors || {}).flat().join(' ') || payload.message || 'Permintaan gagal.');
    return payload as T;
}
export async function downloadAssignmentFile(url: string, filename: string) {
    const response = await fetch(url,{headers:taskHeaders()});
    if (!response.ok) { const data = await response.json().catch(()=>({})); throw new Error(data.message || 'Unduhan gagal.'); }
    const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href=objectUrl; link.download=filename; link.click();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
