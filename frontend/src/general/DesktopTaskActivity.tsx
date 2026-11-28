interface Props { date: Date; logs: {id?: number; time: string; role: string}[]; roleLabel?: string }
export default function DesktopTaskActivity({date, logs, roleLabel = 'Crew'}: Props) {
    return (
<div className="flex flex-col h-full min-h-0">
                                <div className="mb-4 shrink-0">
                                    <h2 className="font-bold text-gray-800 text-lg">Aktivitas</h2>
                                    <p className="text-sm text-gray-400">
                                        {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="space-y-4 flex-1 overflow-y-auto pr-2 min-h-0">
                                    {logs.length > 0 ? (
                                        logs.map((log: any, idx: number) => (
                                            <div key={log.id || idx} className="bg-gray-200 rounded-xl p-4 flex items-center justify-between">
                                                <span className="text-sm font-bold text-gray-700">{log.time}</span>
                                                <span className="text-sm font-medium text-gray-600">{roleLabel} - {log.role}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">
                                            Belum ada log aktivitas pada tanggal ini.
                                        </div>
                                    )}
                                </div>
                            </div>
    );
}
