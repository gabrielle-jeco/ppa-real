import React from 'react';
import { ChevronDown, Star } from 'lucide-react';
import type { DummyDashboardData } from './dummySupervisorDashboard';

interface CrewListProps {
    data: DummyDashboardData;
    selectedId: number | null;
    onSelect: (id: number) => void;
}

export default function CrewList({ data, selectedId, onSelect }: CrewListProps) {
    const { supervisor, location_name, location_avg_progress, crews } = data;

    return (
        <div className="bg-white h-full border-r border-gray-200 flex flex-col w-full md:w-64 lg:w-64 xl:w-64 2xl:w-96 flex-shrink-0 z-10 transition-all duration-300">
            <div className="p-8 pb-4">
                <h1 className="text-xl font-bold text-gray-900 mb-6">Employee</h1>

                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Welcome, Supervisor Fashion</p>
                    <h2 className="text-lg font-bold text-gray-800">{supervisor?.name || 'User'}!</h2>
                </div>

                <div className="relative mb-6">
                    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{location_name}</span>
                        <ChevronDown size={16} className="text-gray-400" />
                    </div>
                </div>

                <div className="mb-2">
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                            className="bg-primary h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${location_avg_progress}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-500">Average Task Progress : <span className="font-medium text-gray-800">{location_avg_progress}%</span></p>
                </div>

                <div className="border-b border-gray-200 mt-4"></div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                {crews.map((crew, index) => (
                    <div
                        key={crew.id}
                        onClick={() => onSelect(crew.id)}
                        className={`relative p-5 rounded-2xl cursor-pointer transition-all border-l-4 shadow-sm ${selectedId === crew.id
                            ? 'bg-white shadow-md border-l-primary border border-transparent ring-1 ring-gray-100'
                            : 'bg-white border-l-transparent hover:border-l-purple-200 border border-gray-50'
                            }`}
                        style={{ boxShadow: selectedId === crew.id ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : '' }}
                    >
                        {crew.is_top_performer && (
                            <div className="absolute top-4 right-4 text-green-500">
                                <Star size={18} fill="currentColor" className="drop-shadow-sm" />
                            </div>
                        )}

                        <div className="mb-4 pr-6">
                            <h3 className="text-sm font-bold text-gray-800">{index + 1}. {crew.name} - {crew.role}</h3>
                        </div>

                        <div className="space-y-2">
                            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                    className="h-3 rounded-full bg-[#f34747]"
                                    style={{ width: `${crew.activity_percentage}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-gray-400">Activity Percentage - {crew.activity_percentage}%</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
