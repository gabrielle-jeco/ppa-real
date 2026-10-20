type TaskWithArea = {
    title?: string | null;
    task_definition?: {
        task_area?: {
            name?: string | null;
        } | null;
    } | null;
};

export const formatTaskTitleWithArea = (task: TaskWithArea) => {
    const title = String(task.title || 'Tugas').trim();
    const areaName = String(task.task_definition?.task_area?.name || '').trim();

    if (!areaName) return title;

    const areaLabel = /^area(?:\s|$)/i.test(areaName) ? areaName : `Area ${areaName}`;
    return `${title} - ${areaLabel}`;
};
