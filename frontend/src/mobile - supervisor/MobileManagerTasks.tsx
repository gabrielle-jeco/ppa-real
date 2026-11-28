import { useEffect, useState } from 'react';
import MobileCrewHistory from '../mobile - crew/MobileCrewHistory';
import MobileTaskExecution from '../mobile - crew/MobileTaskExecution';
import CrewTaskExportModal from '../general/CrewTaskExportModal';
import TaskEvidenceAttachment from '../general/TaskEvidenceAttachment';
import { assignmentRequest, downloadAssignmentFile, localDate } from '../utils/managerAssignments';
import type { AssignmentEvidence, AssignmentRecipient, SupervisorAssignment } from '../utils/managerAssignments';

interface Props { supervisor: AssignmentRecipient; onBack: () => void }

// Only API/file access differs. Upload, list, preview and navigation use the crew components.
export default function MobileManagerTasks({ supervisor, onBack }: Props) {
    const [task, setTask] = useState<(SupervisorAssignment & { _selected_date?: string }) | null>(() => { const state=window.history.state; return state?.app==='supervisor-mobile'&&state?.view==='ASSIGNED_TASKS'?state.assignedTask||null:null; });
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const restore = (event: PopStateEvent) => {
            setTask(event.state?.app === 'supervisor-mobile' && event.state?.view === 'ASSIGNED_TASKS' ? event.state.assignedTask || null : null);
        };
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
    }, []);
    const selectTask = (selected: SupervisorAssignment, selectedDate?: string) => {
        const taskWithDate = selectedDate ? { ...selected, _selected_date: selectedDate } : selected;
        window.history.pushState({ ...window.history.state, app: 'supervisor-mobile', view: 'ASSIGNED_TASKS', assignedTask: taskWithDate }, '', window.location.href);
        setTask(taskWithDate);
    };
    const upload = async (data: FormData) => {
        if (!task) return;
        const taskId = task.id;
        data.set('action_date', task._selected_date || localDate());
        const updated = await assignmentRequest<SupervisorAssignment>(`/api/manager/tasks/${taskId}/evidence`, { method: 'POST', body: data });
        setTask(current => current?.id === taskId ? { ...updated, _selected_date: current._selected_date } : current);
        setRevision(value => value + 1);
    };
    const download = async (evidence: AssignmentEvidence) => {
        if (!task) return;
        try { await downloadAssignmentFile(`/api/manager/tasks/${task.id}/evidences/${evidence.id}/download`, `bukti-${evidence.id}.xlsx`); }
        catch (error) { alert(error instanceof Error ? error.message : 'Unduhan gagal.'); }
    };
    const closeTask = () => {
        if (window.history.state?.app === 'supervisor-mobile' && window.history.state?.assignedTask) {
            window.history.back();
            return;
        }
        setTask(null);
    };
    return <>
        <MobileCrewHistory user={{ user_id: supervisor.id }} selectedRole="" taskSource="manager" title="Ceklis Tugas" onBack={onBack}
            refreshTrigger={revision} onSelectTask={selectTask} toolbar={<CrewTaskExportModal mobile/>}/>
        {task&&<MobileTaskExecution key={task.id} task={{...task,task_id:task.id,evidences:task.evidences.map(evidence=>({...evidence,type:'after'}))}}
            resultOnly onClose={closeTask} onUpload={upload}
            renderEvidenceThumbnail={evidence=><TaskEvidenceAttachment taskId={task.id} evidence={evidence} mobile presentation="thumbnail"/>}
            renderEvidencePreview={evidence=><TaskEvidenceAttachment taskId={task.id} evidence={evidence} mobile presentation="preview"/>}
            onDownloadEvidence={download}/>}
    </>;
}
