export default function ManagerDashboard() {
    const placeholderCards = ['Store Summary', 'Supervisor List', 'Task Snapshot'];

    return (
        <div className="h-full overflow-auto p-8 bg-gray-100">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mt-2">
                    Dashboard
                </h1>
            </div>

            <div className="grid grid-cols-12 gap-5 h-[calc(100vh-12rem)] min-h-[560px]">
                <section className="col-span-3 bg-white border border-dashed border-gray-300 rounded-2xl p-5">
                    <div className="h-5 w-28 bg-gray-200 rounded mb-6"></div>
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map((item) => (
                            <div key={item} className="h-16 rounded-xl bg-gray-100 border border-gray-200"></div>
                        ))}
                    </div>
                </section>

                <section className="col-span-6 bg-white border border-dashed border-gray-300 rounded-2xl p-5">
                    <div className="h-6 w-40 bg-gray-200 rounded mb-6"></div>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        {placeholderCards.map((label) => (
                            <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="h-3 w-20 bg-gray-200 rounded mb-4"></div>
                                <div className="h-8 w-14 bg-gray-300 rounded"></div>
                            </div>
                        ))}
                    </div>
                    <div className="h-64 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-sm">
                        Empty chart placeholder
                    </div>
                </section>

                <section className="col-span-3 bg-white border border-dashed border-gray-300 rounded-2xl p-5">
                    <div className="h-5 w-24 bg-gray-200 rounded mb-6"></div>
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div key={item} className="h-12 rounded-lg bg-gray-100 border border-gray-200"></div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
