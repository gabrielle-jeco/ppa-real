const isEnabled = (value: unknown, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    return String(value).toLowerCase() === 'true';
};

export const featureFlags = {
    bulkAssignment: isEnabled(import.meta.env.VITE_ENABLE_BULK_ASSIGNMENT, true),
    taskWeight: isEnabled(import.meta.env.VITE_ENABLE_TASK_WEIGHT),
};
