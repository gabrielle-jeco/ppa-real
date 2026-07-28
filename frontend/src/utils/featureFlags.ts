const isEnabled = (value: unknown) => String(value || '').toLowerCase() === 'true';

export const featureFlags = {
    bulkAssignment: isEnabled(import.meta.env.VITE_ENABLE_BULK_ASSIGNMENT),
    taskWeight: isEnabled(import.meta.env.VITE_ENABLE_TASK_WEIGHT),
};
