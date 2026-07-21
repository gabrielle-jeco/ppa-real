import { useEffect, useState } from 'react';
import TaskStartStatus from '../general/TaskStartStatus';
import type { ReactNode } from 'react';
import { ChevronDown, ClipboardList, UserX, Star, CalendarDays } from 'lucide-react';

type SummaryData = {
    date: string;
    location: { name: string; initial?: string };
    supervisor: { name: string };
    cards: {
        team_task_progress: { completed: number; total: number };
        unassigned_crews: { count: number; total: number };
        team_average_score: number;
        today_total_tasks: number;
    };
    top_performers: Array<{ id: string; name: string; completed_tasks: number; score: number }>;
    pending_approvals: Array<{ id: number; crew_name: string; title: string; start_at?: string; due_at?: string }>;
    attendance_monitor: Array<{ id: string; name: string; no_absen: number; telat: number; izin: number; sakit: number }>;
    workload_monitor: Array<{ id: string; name: string; task_count: number; total_weight: number; average_weight: number }>;
};

const emptySummary: SummaryData = {
    date: new Date().toISOString().slice(0, 10),
    location: { name: '-' },
    supervisor: { name: '-' },
    cards: {
        team_task_progress: { completed: 0, total: 0 },
        unassigned_crews: { count: 0, total: 0 },
        team_average_score: 0,
        today_total_tasks: 0,
    },
    top_performers: [],
    pending_approvals: [],
    attendance_monitor: [],
    workload_monitor: [],
};

export default function SupervisorSummaryDashboard() {
    const [summary, setSummary] = useState<SummaryData>(emptySummary);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('auth_token');
                const response = await fetch('/api/supervisor/dashboard-summary', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                });
                if (response.ok) {
                    setSummary(await response.json());
                }
            } catch (error) {
                console.error('Gagal mengambil ringkasan dashboard supervisor', error);
            } finally {
                setLoading(false);
            }
        };

        fetchSummary();
    }, []);

    return (
        <div className="h-full bg-gray-50 flex overflow-hidden">
            <section className="flex-1 overflow-y-auto px-8 py-8">
                <div className="flex items-center gap-8 mb-8">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-wide text-gray-900">Dasbor</h1>
                        <div className="h-px w-72 bg-gray-200 mt-5"></div>
                    </div>
                    <div className="relative w-80">
                        <button className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm text-left">
                            <span className="text-sm font-black text-gray-700 uppercase tracking-wide">{summary.location.name}</span>
                            <ChevronDown size={18} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="mb-12">
                    <p className="text-sm text-gray-500 mb-2">Selamat datang, Supervisor Fashion</p>
                    <h2 className="text-xl font-black text-gray-900">{summary.supervisor.name}!</h2>
                </div>

                {loading ? (
                    <div className="rounded-3xl bg-white border border-gray-100 p-10 text-center text-gray-400 shadow-sm">
                        Memuat ringkasan dasbor...
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-10">
                            <MetricCard
                                color="border-primary"
                                icon={<ClipboardList size={22} />}
                                title="Pekerjaan Tim"
                                value={`${summary.cards.team_task_progress.completed}/${summary.cards.team_task_progress.total}`}
                                suffix="Pekerjaan"
                            />
                            <MetricCard
                                color="border-red-400"
                                icon={<UserX size={22} />}
                                title="Belum Ada Penugasan"
                                value={`${summary.cards.unassigned_crews.count}/${summary.cards.unassigned_crews.total}`}
                                suffix="Orang"
                            />
                            <MetricCard
                                color="border-green-500"
                                icon={<Star size={22} />}
                                title="Rata-rata Penilaian Tim"
                                value={summary.cards.team_average_score}
                            />
                            <MetricCard
                                color="border-yellow-400"
                                icon={<CalendarDays size={22} />}
                                title="Total Pekerjaan Hari Ini"
                                value={summary.cards.today_total_tasks}
                            />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-4">
                            <DashboardPanel title="Beban Penugasan Tim" accent="border-primary">
                                <p className="text-[11px] font-semibold text-red-500 mb-4">
                                    Monitoring bobot pekerjaan berdasarkan tingkat kesulitan tugas yang diberikan hari ini.
                                </p>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-200 text-gray-800">
                                            <th className="px-4 py-2 text-sm">Nama</th>
                                            <th className="px-2 py-2 text-center text-sm">Tugas</th>
                                            <th className="px-2 py-2 text-right text-sm">Bobot</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.workload_monitor.length === 0 ? (
                                            <tr><td className="px-4 py-6 text-sm text-gray-400" colSpan={3}>Belum ada data bobot.</td></tr>
                                        ) : summary.workload_monitor.slice(0, 5).map((crew, index) => (
                                            <tr key={crew.id} className="font-bold text-gray-800">
                                                <td className="px-1 py-2">{index + 1}. {crew.name}</td>
                                                <td className="px-2 py-2 text-center">{crew.task_count}</td>
                                                <td className="px-2 py-2 text-right">{crew.total_weight}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </DashboardPanel>

                            <DashboardPanel title="Performa Terbaik Tim" accent="border-primary">
                                <p className="text-[11px] font-semibold text-red-500 mb-4">
                                    Daftar berdasarkan jumlah pekerjaan yang telah diselesaikan dan disetujui supervisor.
                                </p>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-200 text-gray-800">
                                            <th className="px-4 py-2 text-sm">Nama</th>
                                            <th className="px-4 py-2 text-sm text-right">Pekerjaan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.top_performers.length === 0 ? (
                                            <tr><td className="px-4 py-6 text-sm text-gray-400" colSpan={2}>Belum ada data performa.</td></tr>
                                        ) : summary.top_performers.map((crew, index) => (
                                            <tr key={crew.id} className="font-bold text-gray-800">
                                                <td className="px-1 py-2">{index + 1}. {crew.name}</td>
                                                <td className="px-4 py-2 text-right">{crew.completed_tasks}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </DashboardPanel>

                            <DashboardPanel title="Daftar Persetujuan Pekerjaan" accent="border-red-400">
                                <p className="text-[11px] font-semibold text-red-500 mb-6">
                                    Daftar pekerjaan yang sudah memiliki bukti tetapi belum disetujui.
                                </p>
                                <div className="space-y-3">
                                    {summary.pending_approvals.length === 0 ? (
                                        <p className="text-sm text-gray-400">Tidak ada pekerjaan yang menunggu persetujuan.</p>
                                    ) : summary.pending_approvals.map((task, index) => (
                                        <div key={task.id} className="text-base font-black text-gray-800 leading-snug">
                                            <p>{index + 1}. {task.crew_name} - {task.title}</p>
                                            <TaskStartStatus
                                                task={task}
                                                scheduleClassName="mt-1 text-[11px] font-semibold text-gray-400"
                                                statusClassName="text-[11px] font-bold text-amber-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </DashboardPanel>

                            <DashboardPanel title="Monitoring Kehadiran Tim" accent="border-orange-400">
                                <p className="text-[11px] font-semibold text-red-500 mb-4">
                                    Daftar menampilkan jumlah tidak ada absen, telat, izin, dan sakit paling banyak.
                                </p>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-200 text-gray-800">
                                            <th className="px-3 py-2 text-sm">Nama</th>
                                            <th className="px-2 py-2 text-center text-sm">?</th>
                                            <th className="px-2 py-2 text-center text-sm">T</th>
                                            <th className="px-2 py-2 text-center text-sm">I</th>
                                            <th className="px-2 py-2 text-center text-sm">S</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.attendance_monitor.length === 0 ? (
                                            <tr><td className="px-3 py-6 text-sm text-gray-400" colSpan={5}>Belum ada data kehadiran.</td></tr>
                                        ) : summary.attendance_monitor.map((crew, index) => (
                                            <tr key={crew.id} className="font-bold text-gray-800">
                                                <td className="px-1 py-2">{index + 1}. {crew.name}</td>
                                                <td className="px-2 py-2 text-center">{crew.no_absen}</td>
                                                <td className="px-2 py-2 text-center">{crew.telat}</td>
                                                <td className="px-2 py-2 text-center">{crew.izin}</td>
                                                <td className="px-2 py-2 text-center">{crew.sakit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </DashboardPanel>
                        </div>
                    </>
                )}
            </section>

        </div>
    );
}

function MetricCard({ title, value, suffix, color, icon }: { title: string; value: string | number; suffix?: string; color: string; icon: ReactNode }) {
    return (
        <div className={`bg-white rounded-3xl border-2 ${color} px-7 py-6 shadow-xl shadow-gray-200/70`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-gray-800">{title}</h3>
                <div className="text-gray-400">{icon}</div>
            </div>
            <div className="flex items-end justify-center gap-2">
                <span className="text-5xl font-black text-gray-900 leading-none">{value}</span>
                {suffix && <span className="text-xs font-black text-gray-700 mb-2">{suffix}</span>}
            </div>
        </div>
    );
}

function DashboardPanel({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
    return (
        <div className={`bg-white rounded-3xl border-2 ${accent} p-6 min-h-[330px] shadow-xl shadow-gray-200/60`}>
            <h3 className="text-xl font-black text-gray-900 mb-1">{title}</h3>
            {children}
        </div>
    );
}
