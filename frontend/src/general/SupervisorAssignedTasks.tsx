import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, Edit3, Trash2, Upload } from 'lucide-react';
import DesktopTaskActivity from './DesktopTaskActivity';
import DesktopTaskActions from './DesktopTaskActions';
import DesktopTaskCalendar from './DesktopTaskCalendar';
import TaskPreview from './TaskPreview';
import TaskStartStatus from './TaskStartStatus';
import RejectTaskModal from './RejectTaskModal';
import ManagerTaskForm from './ManagerTaskForm';
import ManagerReviewForm from '../desktop - manager/ManagerReviewForm';
import TaskEvidenceAttachment from './TaskEvidenceAttachment';
import { notifyApprovalGrace } from '../utils/browserNotifications';
import { canToggleTaskApproval, canRejectTask, canDeleteTask } from '../utils/taskReview';
import { canAssignTaskOnDate } from '../utils/taskDateWindow';
import { featureFlags } from '../utils/featureFlags';
import { assignmentRequest, localDate, validateEvidenceFile } from '../utils/managerAssignments';
import type { AssignmentRecipient, SupervisorAssignment } from '../utils/managerAssignments';

interface Props {
    supervisor: AssignmentRecipient;
    reviewer?: boolean;
    recipients?: AssignmentRecipient[];
    locationId?: string;
    active?: boolean;
    onChanged?: () => void;
}

const panel = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';

export default function SupervisorAssignedTasks({
    supervisor,
    reviewer = false,
    recipients = [],
    locationId,
    active = true,
    onChanged,
}: Props) {
    const [date, setDate] = useState(localDate());
    const [tasks, setTasks] = useState<SupervisorAssignment[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState<{ bulk: boolean; task?: SupervisorAssignment } | null>(null);
    const [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(null);
    const [evaluationOpen, setEvaluationOpen] = useState(false);
    const [evaluationLoading, setEvaluationLoading] = useState(true);
    const [file, setFile] = useState<File | null>(null);
    const [rejectTaskId, setRejectTaskId] = useState<number | null>(null);
    const [activityLogs, setActivityLogs] = useState<{ id?: number; time: string; role: string }[]>([]);
    const [updatingIds, setUpdatingIds] = useState<Set<number>>(() => new Set());
    const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

    const pendingActions = useRef(new Set<number>());
    const taskDateBeforeEvaluation = useRef<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const context = useRef('');
    const requestKey = `${supervisor.id}|${date}`;
    context.current = requestKey;

    const previewingActivity = !evaluationOpen && selectedId === null;

    useEffect(() => {
        setLoading(true);
        setError('');
        setTasks([]);
        setSelectedId(null);
        setFile(null);
        setEvaluationLoading(true);
        setEvaluation(null);
        setRejectTaskId(null);
        setEvaluationOpen(false);
        setForm(null);
        setActivityLogs([]);
        taskDateBeforeEvaluation.current = null;
    }, [supervisor.id, reviewer]);

    useEffect(() => {
        if (!active) return;

        const controller = new AbortController();
        let requestId = 0;

        const load = async () => {
            const id = ++requestId;
            const current = () => !controller.signal.aborted && id === requestId;
            const failure = (err: unknown) => {
                if (!current()) return;
                console.error(err);
                if (!reviewer) {
                    setError(err instanceof Error ? err.message : 'Permintaan gagal.');
                }
            };

            const requests: Promise<unknown>[] = [
                assignmentRequest<SupervisorAssignment[]>(
                    `${reviewer ? `/api/manager/supervisors/${encodeURIComponent(supervisor.id)}/tasks` : '/api/supervisor/manager-tasks'}?date=${date}`,
                    { signal: controller.signal },
                )
                    .then((data) => {
                        if (!current()) return;
                        setTasks(data);
                        setSelectedId((selected) => (data.some((item) => item.id === selected) ? selected : null));
                    })
                    .catch(failure)
                    .finally(() => {
                        if (current()) setLoading(false);
                    }),
            ];

            if (previewingActivity) {
                requests.push(
                    assignmentRequest<{ id?: number; time: string; role: string }[]>(
                        `/api/crew/activity-logs?user_id=${encodeURIComponent(supervisor.id)}&date=${date}`,
                        { signal: controller.signal },
                    )
                        .then((data) => {
                            if (current()) setActivityLogs(data);
                        })
                        .catch(failure),
                );
            }

            if (reviewer) {
                requests.push(
                    assignmentRequest<Record<string, unknown>>(
                        `/api/evaluations/check/${encodeURIComponent(supervisor.id)}?date=${date}`,
                        { signal: controller.signal },
                    )
                        .then((data) => {
                            if (current()) setEvaluation(data);
                        })
                        .catch(failure)
                        .finally(() => {
                            if (current()) setEvaluationLoading(false);
                        }),
                );
            }

            await Promise.allSettled(requests);
        };

        void load();
        const timer = window.setInterval(() => {
            setCurrentTimestamp(Date.now());
            if (document.visibilityState === 'visible') {
                void load();
            }
        }, 60000);

        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [supervisor.id, date, revision, reviewer, active, previewingActivity]);

    const refresh = () => {
        setRevision((value) => value + 1);
        onChanged?.();
    };

    useEffect(() => {
        if (reviewer) {
            tasks.forEach((item) => notifyApprovalGrace({ ...item, task_id: item.id, task_context: 'manager_supervisor' }));
        }
    }, [tasks, reviewer]);

    const selectedTask = evaluationOpen ? undefined : tasks.find((item) => item.id === selectedId);
    const rejectTask = rejectTaskId === null ? null : tasks.find((item) => item.id === rejectTaskId) ?? null;

    const action = async (taskId: number, url: string, method: string, body?: unknown) => {
        const key = requestKey;
        const approval = url.endsWith('/status');
        if (approval && pendingActions.current.has(taskId)) return;

        if (approval) {
            pendingActions.current.add(taskId);
            setUpdatingIds((current) => new Set(current).add(taskId));
        }
        if (!reviewer) setBusy(true);
        setError('');

        try {
            const updated = await assignmentRequest<SupervisorAssignment>(url, {
                method,
                body: body instanceof FormData ? body : JSON.stringify(body),
            });

            if (context.current === key) {
                if (approval) {
                    setTasks((current) => current.map((item) => (item.id === taskId ? { ...item, ...updated } : item)));
                    onChanged?.();
                } else {
                    if (body instanceof FormData) {
                        setFile(null);
                        if (fileInput.current) fileInput.current.value = '';
                        setTasks((current) => current.map((item) => (item.id === taskId ? { ...item, ...updated } : item)));
                    }
                    refresh();
                }
            }
        } catch (err) {
            if (context.current === key) {
                alert(err instanceof Error ? err.message : 'Permintaan gagal.');
            }
        } finally {
            if (!reviewer) setBusy(false);
            pendingActions.current.delete(taskId);
            setUpdatingIds((current) => {
                const next = new Set(current);
                next.delete(taskId);
                return next;
            });
        }
    };

    const handleOpenEvaluation = () => {
        if (!evaluation) return;
        if (!evaluationOpen) {
            taskDateBeforeEvaluation.current = date;
            const period = evaluation.evaluation_period || evaluation.target_period;
            if (typeof period === 'string' && period.length >= 10) {
                setDate(period.slice(0, 10));
            }
        }
        setEvaluationOpen(true);
    };

    const handleShowTasks = () => {
        if (taskDateBeforeEvaluation.current) {
            setDate(taskDateBeforeEvaluation.current);
            taskDateBeforeEvaluation.current = null;
        }
        setEvaluationOpen(false);
    };

    const now = new Date(currentTimestamp);
    const today = localDate(now);
    const canAssign = canAssignTaskOnDate(new Date(`${date}T12:00:00`), now);
    const completed = tasks.filter((item) => item.status === 'approved').length;
    const selectedDate = new Date(`${date}T12:00:00`);

    return (
        <div className="flex flex-col h-full min-h-0 bg-gray-50 p-6 overflow-y-auto lg:overflow-hidden relative flex-1">
            {!reviewer && error && (
                <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full flex-1 min-h-0">
                <aside className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 lg:gap-6 h-full overflow-y-auto pr-2 min-h-0">
                    <section className={panel}>
                        <h2 className="text-xl font-bold text-primary mb-1">{supervisor.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            {reviewer ? 'Role sebagai ' : 'Tugas dari '}
                            <span className="underline decoration-primary">{reviewer ? 'Supervisor' : 'Manager'}</span>
                            <br />
                            Hari ini
                        </p>
                        {reviewer && (
                            <button
                                type="button"
                                className={`text-xs font-bold py-2 px-6 rounded-full transition w-full ${evaluationOpen
                                    ? 'bg-purple-100 text-primary border-2 border-primary'
                                    : !evaluation
                                        ? 'bg-gray-100 text-gray-400 border-2 border-transparent cursor-not-allowed'
                                        : 'bg-primary text-white border-2 border-transparent hover:bg-purple-700 shadow-md'
                                    }`}
                                disabled={busy || evaluationLoading || !evaluation}
                                onClick={handleOpenEvaluation}
                            >
                                {evaluationLoading ? 'Memeriksa...' : !evaluation ? 'Tidak Tersedia' : evaluation.evaluated ? 'Lihat Evaluasi' : 'Evaluasi'}
                            </button>
                        )}
                    </section>

                    <section className={`${panel} flex-1 flex flex-col`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Aktivitas &amp; Tugas</h3>
                            <button
                                type="button"
                                className={`text-[10px] font-bold py-1 px-3 rounded-full transition border ${!evaluationOpen
                                    ? 'bg-purple-100 text-primary border-primary'
                                    : 'bg-primary text-white border-transparent hover:bg-purple-700'
                                    }`}
                                onClick={handleShowTasks}
                            >
                                Lihat
                            </button>
                        </div>

                        <div className="mb-0">
                            <h4 className="font-bold text-gray-800 text-sm mb-3">Tugas</h4>
                            {reviewer && (
                                <DesktopTaskActions
                                    canAssign={canAssign}
                                    bulkEnabled={featureFlags.bulkAssignment}
                                    busy={busy}
                                    onIndividual={() => setForm({ bulk: false })}
                                    onBulk={() => setForm({ bulk: true })}
                                />
                            )}
                            <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400">Tugas Selesai: {completed}/{tasks.length}</p>
                        </div>

                        <DesktopTaskCalendar
                            selectedDate={selectedDate}
                            onChange={(value) => {
                                if (!busy) setDate(localDate(value));
                            }}
                        />
                    </section>
                </aside>

                <section className="flex min-h-0 flex-col lg:col-span-4 lg:h-full lg:overflow-hidden 2xl:col-span-5">
                    {evaluationOpen && evaluation ? (
                        <ManagerReviewForm
                            key={`${supervisor.id}-${date}`}
                            supervisor={supervisor}
                            targetDate={selectedDate}
                            evaluationStatus={evaluation}
                            onSuccess={refresh}
                        />
                    ) : (
                        <>
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-gray-800">Daftar Pekerjaan</h2>
                                <p className="text-sm text-gray-400">Hari ini</p>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
                                {loading && tasks.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">Memuat tugas...</div>
                                ) : !tasks.length ? (
                                    <div className="text-center text-gray-400 py-10">Tidak ada tugas.</div>
                                ) : (
                                    tasks.map((item) => {
                                        const canEdit = reviewer && !busy && item.status !== 'approved' && !item.evidences.length && new Date(item.due_at) >= now;
                                        return (
                                            <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                                <div className="flex items-start gap-3">
                                                    <button
                                                        type="button"
                                                        aria-label={item.status === 'approved' ? 'Batalkan approval' : 'Approve'}
                                                        disabled={!reviewer || updatingIds.has(item.id) || !canToggleTaskApproval(item, now)}
                                                        onClick={() => void action(
                                                            item.id,
                                                            `/api/manager/tasks/${item.id}/status`,
                                                            'PATCH',
                                                            { status: item.status === 'approved' ? 'pending' : 'approved', action_date: today },
                                                        )}
                                                        className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${item.status === 'approved'
                                                            ? 'bg-purple-100 border-primary text-primary'
                                                            : 'border-gray-300'
                                                            } ${reviewer && !updatingIds.has(item.id) && canToggleTaskApproval(item, now)
                                                                ? 'cursor-pointer hover:border-primary'
                                                                : 'cursor-default opacity-60'
                                                            }`}
                                                    >
                                                        {item.status === 'approved' && <CheckCircle size={14} strokeWidth={3} />}
                                                    </button>

                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-medium ${item.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>{item.title}</p>
                                                        <p className="text-[10px] text-primary font-semibold mt-1 whitespace-pre-wrap break-words">Target: {item.target}</p>
                                                        <TaskStartStatus
                                                            task={item}
                                                            scheduleClassName="text-[10px] text-gray-400 mt-1"
                                                            statusClassName="text-[10px] text-amber-500 font-semibold mt-1"
                                                        />
                                                        <p className="text-[10px] text-gray-400 mt-1">Tenggat: {new Date(item.due_at).toLocaleString('id-ID')}</p>
                                                        {item.description && (
                                                            <p className="text-[10px] text-gray-500 leading-snug whitespace-pre-line break-words mt-0.5">{item.description}</p>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col gap-2 items-center">
                                                        {item.review_summary && (
                                                            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-[10px] font-bold text-white">
                                                                {item.review_summary.potential_score ?? 0}%
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedId(item.id);
                                                                setEvaluationOpen(false);
                                                                setFile(null);
                                                                setRejectTaskId(null);
                                                                setError('');
                                                            }}
                                                            className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition shadow-sm flex items-center gap-1"
                                                        >
                                                            <Camera size={12} /> Bukti
                                                        </button>
                                                        {reviewer && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRejectTaskId(item.id)}
                                                                    disabled={busy || !canRejectTask(item, now)}
                                                                    className="rounded-lg bg-red-500 px-4 py-1.5 text-[10px] font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                                                                >
                                                                    Reject
                                                                </button>
                                                                <div className="flex items-center gap-1">
                                                                    {canDeleteTask(item, now) && (
                                                                        <button
                                                                            type="button"
                                                                            aria-label={item.assignment_batch_id ? 'Hapus Bulk' : 'Hapus tugas'}
                                                                            disabled={busy}
                                                                            onClick={() => {
                                                                                if (window.confirm('Hapus tugas ini?')) {
                                                                                    void action(item.id, `/api/manager/tasks/${item.id}`, 'DELETE');
                                                                                }
                                                                            }}
                                                                            className="text-red-400 hover:text-red-600 p-1 opacity-50 group-hover:opacity-100 transition"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    )}
                                                                    {canEdit && (!item.assignment_batch_id || featureFlags.bulkAssignment) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setForm({ bulk: !!item.assignment_batch_id, task: item })}
                                                                            className="text-gray-400 hover:text-primary p-1 opacity-50 group-hover:opacity-100 transition"
                                                                            title={item.assignment_batch_id ? 'Edit Bulk Assignment' : 'Edit tugas'}
                                                                        >
                                                                            <Edit3 size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </section>

                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 flex flex-col h-full overflow-y-auto min-h-0">
                    {selectedTask ? (
                        <>
                            <TaskPreview
                                key={selectedTask.id}
                                task={{ ...selectedTask, evidences: selectedTask.evidences }}
                                resultOnly
                                onClose={() => setSelectedId(null)}
                                renderThumbnail={(evidence) => (
                                    <TaskEvidenceAttachment taskId={selectedTask.id} evidence={evidence} presentation="thumbnail" />
                                )}
                                renderEvidence={(evidence) => (
                                    <TaskEvidenceAttachment taskId={selectedTask.id} evidence={evidence} presentation="desktop-preview" />
                                )}
                            />
                            {!reviewer && (
                                <div className="space-y-3 border-t pt-4">
                                    <p className="text-xs text-gray-500">
                                        Satu foto atau XLSX per pengumpulan, maksimal 10 MB. Unggah ulang setelah bukti ditolak.
                                    </p>
                                    <input
                                        key={selectedTask.id}
                                        ref={fileInput}
                                        aria-label="Pilih bukti tugas"
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.webp,.xlsx"
                                        disabled={busy || !selectedTask.review_summary?.can_upload_after || new Date(selectedTask.start_at) > new Date()}
                                        onChange={(event) => {
                                            const chosen = event.target.files?.[0];
                                            setError('');
                                            setFile(null);
                                            if (chosen) {
                                                const problem = validateEvidenceFile(chosen);
                                                if (problem) {
                                                    setError(problem);
                                                    event.target.value = '';
                                                } else {
                                                    setFile(chosen);
                                                }
                                            }
                                        }}
                                        className="block w-full text-xs"
                                    />
                                    <button
                                        type="button"
                                        className="w-full rounded-xl bg-primary p-3 text-sm font-bold text-white disabled:opacity-40"
                                        disabled={busy || !file || !selectedTask.review_summary?.can_upload_after || new Date(selectedTask.start_at) > new Date()}
                                        onClick={() => {
                                            if (!file) return;
                                            const data = new FormData();
                                            data.append('after[]', file);
                                            data.append('action_date', today);
                                            void action(selectedTask.id, `/api/manager/tasks/${selectedTask.id}/evidence`, 'POST', data);
                                            if (fileInput.current) fileInput.current.value = '';
                                        }}
                                    >
                                        <Upload size={15} className="inline" /> {busy ? 'Mengirim...' : 'Kirim Bukti'}
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <DesktopTaskActivity date={selectedDate} logs={activityLogs} roleLabel="Supervisor" />
                    )}
                </div>
            </div>

            <RejectTaskModal
                task={rejectTask ? { ...rejectTask, task_id: rejectTask.id } : null}
                isOpen={rejectTask !== null}
                onClose={() => setRejectTaskId(null)}
                onSubmit={async (note) => {
                    if (rejectTaskId === null) return;
                    const key = requestKey;
                    const updated = await assignmentRequest<SupervisorAssignment>(`/api/manager/tasks/${rejectTaskId}/reject`, {
                        method: 'POST',
                        body: JSON.stringify({ note, action_date: today }),
                    });
                    if (context.current === key) {
                        setTasks((current) => current.map((item) => (item.id === rejectTaskId ? { ...item, ...updated } : item)));
                        onChanged?.();
                    }
                }}
            />

            {form && (
                <ManagerTaskForm
                    recipients={recipients}
                    selectedId={supervisor.id}
                    date={date}
                    bulk={form.bulk}
                    task={form.task}
                    onClose={() => setForm(null)}
                    onSave={async (payload) => {
                        const url = form.task
                            ? (form.bulk
                                ? `/api/manager/task-batches/${form.task.assignment_batch_id}`
                                : `/api/manager/tasks/${form.task.id}`)
                            : (form.bulk ? '/api/manager/tasks/bulk' : '/api/manager/tasks');
                        await assignmentRequest(url, {
                            method: form.task ? 'PATCH' : 'POST',
                            body: JSON.stringify({ ...payload, ...(locationId ? { location_id: locationId } : {}) }),
                        });
                        refresh();
                    }}
                />
            )}
        </div>
    );
}
