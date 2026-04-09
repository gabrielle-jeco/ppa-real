export interface DummyTask {
    task_id: number;
    title: string;
    note?: string;
    due_at: string;
    status: 'pending' | 'approved';
}

export interface DummyActivityLog {
    id: number;
    time: string;
    role: string;
    action: string;
}

export interface DummyDayRecord {
    dateKey: string;
    tasks: DummyTask[];
    activityLogs: DummyActivityLog[];
    summary: string;
}

export interface DummyCrew {
    id: number;
    name: string;
    role: string;
    current_workstation: string;
    location: string;
    status: 'active' | 'inactive';
    score: number;
    activity_percentage: number;
    task_progress: number;
    has_tasks: boolean;
    is_top_performer: boolean;
    highlights: string[];
    next_focus: string[];
    dailyRecords: DummyDayRecord[];
}

export interface DummyDashboardData {
    supervisor: {
        id: number;
        name: string;
        role: string;
        location: string;
    };
    location_name: string;
    location_avg_progress: number;
    crews: DummyCrew[];
}

const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getRelativeDate = (dayOffset: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date;
};

const buildDateTime = (date: Date, hours: number, minutes: number) => {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${hours}`.padStart(2, '0');
    const minute = `${minutes}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}T${hour}:${minute}:00`;
};

const today = getRelativeDate(0);
const yesterday = getRelativeDate(-1);
const twoDaysAgo = getRelativeDate(-2);

export const createSupervisorDashboardDummyData = (supervisorName?: string): DummyDashboardData => {
    const crews: DummyCrew[] = [
        {
            id: 101,
            name: 'Budi Crew',
            role: 'employee',
            current_workstation: 'cashier',
            location: 'Yogya Sudirman',
            status: 'active',
            score: 62,
            activity_percentage: 62,
            task_progress: 50,
            has_tasks: true,
            is_top_performer: false,
            highlights: ['Fast on opening prep', 'Consistent role switch log'],
            next_focus: ['Photo submission flow', 'Approval status on desktop'],
            dailyRecords: [
                {
                    dateKey: formatDateKey(today),
                    summary: 'Dashboard demo state for active tasks on the current day.',
                    tasks: [
                        {
                            task_id: 1101,
                            title: 'dummy task',
                            note: '',
                            due_at: buildDateTime(today, 18, 0),
                            status: 'pending',
                        },
                        {
                            task_id: 1102,
                            title: 'cek task',
                            note: '',
                            due_at: buildDateTime(today, 21, 0),
                            status: 'approved',
                        },
                    ],
                    activityLogs: [
                        { id: 1, time: '13:21', role: 'cashier', action: 'station_changed' },
                        { id: 2, time: '13:21', role: 'supermarket', action: 'station_changed' },
                        { id: 3, time: '13:21', role: 'cashier', action: 'station_changed' },
                    ],
                },
                {
                    dateKey: formatDateKey(yesterday),
                    summary: 'Previous-day snapshot kept for dashboard timeline review.',
                    tasks: [
                        {
                            task_id: 1104,
                            title: 'Count promo flyers',
                            due_at: buildDateTime(yesterday, 9, 0),
                            status: 'approved',
                        },
                        {
                            task_id: 1105,
                            title: 'Assist member card desk',
                            due_at: buildDateTime(yesterday, 15, 0),
                            status: 'approved',
                        },
                    ],
                    activityLogs: [
                        { id: 4, time: '08:15', role: 'Cashier', action: 'Started opening checklist' },
                        { id: 5, time: '12:05', role: 'Cashier', action: 'Shifted to member assistance' },
                    ],
                },
            ],
        },
        {
            id: 102,
            name: 'Deni Crew',
            role: 'employee',
            current_workstation: 'supermarket',
            location: 'Yogya Sudirman',
            status: 'active',
            score: 69,
            activity_percentage: 69,
            task_progress: 50,
            has_tasks: true,
            is_top_performer: false,
            highlights: ['Strong aisle recovery', 'Neat stock rotation notes'],
            next_focus: ['Desktop task approval interaction', 'Evaluation module'],
            dailyRecords: [
                {
                    dateKey: formatDateKey(today),
                    summary: 'A lighter task load for dashboard milestone testing.',
                    tasks: [
                        {
                            task_id: 1201,
                            title: 'Refill cooking oil shelf',
                            note: 'Match front-facing labels.',
                            due_at: buildDateTime(today, 10, 0),
                            status: 'approved',
                        },
                        {
                            task_id: 1202,
                            title: 'Update price tag strip',
                            due_at: buildDateTime(today, 13, 15),
                            status: 'pending',
                        },
                        {
                            task_id: 1203,
                            title: 'Check endcap promo placement',
                            due_at: buildDateTime(today, 16, 0),
                            status: 'pending',
                        },
                    ],
                    activityLogs: [
                        { id: 6, time: '08:09', role: 'Supermarket', action: 'Started shelf refill round' },
                        { id: 7, time: '11:32', role: 'Supermarket', action: 'Checked label alignment' },
                    ],
                },
                {
                    dateKey: formatDateKey(twoDaysAgo),
                    summary: 'Earlier snapshot available to show combined task and activity history.',
                    tasks: [
                        {
                            task_id: 1204,
                            title: 'Rearrange snack gondola',
                            due_at: buildDateTime(twoDaysAgo, 9, 45),
                            status: 'approved',
                        },
                    ],
                    activityLogs: [
                        { id: 8, time: '08:21', role: 'Supermarket', action: 'Started gondola refresh' },
                        { id: 9, time: '14:05', role: 'Supermarket', action: 'Finished promo lane recovery' },
                    ],
                },
            ],
        },
        {
            id: 103,
            name: 'Rina Crew',
            role: 'employee',
            current_workstation: 'fashion',
            location: 'Yogya Sudirman',
            status: 'active',
            score: 84,
            activity_percentage: 84,
            task_progress: 50,
            has_tasks: true,
            is_top_performer: true,
            highlights: ['Best mannequin refresh this week', 'Strong visual merchandising sense'],
            next_focus: ['Desktop submission preview', 'Cross-role dashboard polish'],
            dailyRecords: [
                {
                    dateKey: formatDateKey(today),
                    summary: 'High-completion example for dashboard comparison.',
                    tasks: [
                        {
                            task_id: 1301,
                            title: 'Refresh folded denim table',
                            due_at: buildDateTime(today, 9, 20),
                            status: 'approved',
                        },
                        {
                            task_id: 1302,
                            title: 'Update mannequin display',
                            note: 'Use the new weekend campaign direction.',
                            due_at: buildDateTime(today, 15, 10),
                            status: 'approved',
                        },
                    ],
                    activityLogs: [
                        { id: 10, time: '08:05', role: 'Fashion', action: 'Prepared opening visual check' },
                        { id: 11, time: '10:47', role: 'Fashion', action: 'Completed denim table refresh' },
                        { id: 12, time: '15:28', role: 'Fashion', action: 'Finalized mannequin update' },
                    ],
                },
                {
                    dateKey: formatDateKey(yesterday),
                    summary: 'One additional day is enough for the dashboard-only milestone.',
                    tasks: [
                        {
                            task_id: 1303,
                            title: 'Sort new arrival rack',
                            due_at: buildDateTime(yesterday, 13, 0),
                            status: 'approved',
                        },
                    ],
                    activityLogs: [
                        { id: 13, time: '09:12', role: 'Fashion', action: 'Tagged new arrivals' },
                    ],
                },
            ],
        },
    ];

    const avgProgress = Math.round(
        crews.reduce((total, crew) => total + crew.task_progress, 0) / crews.length
    );

    return {
        supervisor: {
            id: 21,
            name: supervisorName || 'Surya Supervisor',
            role: 'Supervisor',
            location: 'Yogya Sudirman',
        },
        location_name: 'Yogya Sudirman',
        location_avg_progress: avgProgress,
        crews,
    };
};

export const findCrewRecordForDate = (crew: DummyCrew, date: Date) => {
    const dateKey = formatDateKey(date);
    return crew.dailyRecords.find((record) => record.dateKey === dateKey) || null;
};
