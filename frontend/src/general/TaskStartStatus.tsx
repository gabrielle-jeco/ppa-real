import { formatTaskStart, isTaskNotStarted, type TaskWithStartTime } from '../utils/taskTiming';

interface TaskStartStatusProps {
    task: TaskWithStartTime | null | undefined;
    display?: 'time' | 'date-time';
    scheduleClassName?: string;
    statusClassName?: string;
}

export default function TaskStartStatus({
    task,
    display = 'time',
    scheduleClassName = 'text-[10px] text-gray-400 mt-0.5',
    statusClassName = 'text-[10px] text-amber-500 font-semibold mt-0.5',
}: TaskStartStatusProps) {
    const formattedStart = formatTaskStart(task, display);
    if (!formattedStart) return null;

    return (
        <>
            <p className={scheduleClassName}>
                {display === 'date-time' ? `Mulai: ${formattedStart}` : `Mulai pukul ${formattedStart}`}
            </p>
            {isTaskNotStarted(task) && (
                <p className={statusClassName}>Belum dimulai</p>
            )}
        </>
    );
}
