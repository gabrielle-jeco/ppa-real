import { useEffect, useMemo, useState } from 'react';
import AddTaskModal from './AddTaskModal';
import BulkTaskModal from './BulkTaskModal';
import { buildManagerTaskPayload } from '../utils/managerAssignments';
import type { AssignmentRecipient, SupervisorAssignment } from '../utils/managerAssignments';

interface Props {
    recipients: AssignmentRecipient[];
    selectedId: string;
    date: string;
    bulk: boolean;
    task?: SupervisorAssignment;
    onClose: () => void;
    onSave: (payload: ReturnType<typeof buildManagerTaskPayload>) => Promise<void>;
}

export default function ManagerTaskForm({ recipients, selectedId, date, bulk, task, onClose, onSave }: Props) {
    const batch = bulk ? task?.assignment_batch : undefined;
    const initialBatch = useMemo(() => (batch ? { ...batch, crew_ids: batch.supervisor_ids } : undefined), [batch]);
    const [title, setTitle] = useState(batch?.title || task?.title || '');
    const [target, setTarget] = useState(batch?.target || task?.target || '');

    useEffect(() => {
        setTitle(batch?.title || task?.title || '');
        setTarget(batch?.target || task?.target || '');
    }, [batch?.title, batch?.target, task?.id, task?.title, task?.target]);

    const label = bulk
        ? 'block text-xs font-bold text-gray-500 mb-1 ml-1'
        : 'block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1';
    const input = 'w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary outline-none shadow-sm';

    const fields = (
        <>
            <div>
                <label htmlFor="manager-task-title" className={label}>Judul tugas</label>
                <input
                    id="manager-task-title"
                    className={input}
                    placeholder="Masukkan judul tugas"
                    required
                    maxLength={255}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                />
            </div>
            <div>
                <label htmlFor="manager-task-target" className={label}>Target tugas</label>
                <textarea
                    id="manager-task-target"
                    className={`${input} resize-none`}
                    placeholder="Masukkan target tugas"
                    rows={2}
                    required
                    maxLength={5000}
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                />
            </div>
        </>
    );

    const submit = async (data: any) => {
        try {
            await onSave(buildManagerTaskPayload({
                title,
                target,
                note: data.note || '',
                supervisorIds: bulk ? data.crew_ids : [selectedId],
                startDate: bulk ? data.start_date : data.start_at.slice(0, 10),
                endDate: bulk ? data.end_date : data.due_at.slice(0, 10),
                startTime: bulk ? data.start_time : data.start_at.slice(11, 16),
                dueTime: bulk ? data.due_time : data.due_at.slice(11, 16),
                repeatDays: data.repeat_days || [],
            }, bulk));
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Gagal menyimpan tugas.');
            throw error;
        }
    };

    return bulk
        ? (
            <BulkTaskModal
                isOpen
                onClose={onClose}
                onSubmit={submit}
                crews={recipients}
                defaultDate={date}
                initialBatch={initialBatch}
                submitLabel={task ? 'Simpan Perubahan' : 'Buat Penugasan'}
                taskFields={fields}
                recipientNoun="supervisor"
            />
        )
        : (
            <AddTaskModal
                isOpen
                onClose={onClose}
                onSubmit={submit}
                defaultDate={date}
                initialTask={task}
                submitLabel={task ? 'Simpan Perubahan' : 'Simpan'}
                taskFields={fields}
            />
        );
}
