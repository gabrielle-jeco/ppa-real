import React from 'react';
import { Star, ChevronDown } from 'lucide-react';

interface SupervisorListProps {
    data: any;
    selectedId: number | null;
    onSelect: (id: number) => void;
    selectedLocationId: string;
    onFilterLocation: (id: string) => void;
}

export default function SupervisorList({ data, selectedId, onSelect, selectedLocationId, onFilterLocation }: SupervisorListProps) {
    const { manager, location_name, location_avg_progress, supervisors, locations } = data;

    // Helper for Color Logic
    const getProgressColor = (score: number) => {
        if (score > 90) return 'bg-green-500';
        if (score > 75) return 'bg-yellow-400';
        return 'bg-red-500';
    };

    return (
        <div className="bg-white h-full border-r border-gray-200 flex flex-col w-full md:w-64 lg:w-64 xl:w-64 2xl:w-96 flex-shrink-0 z-10 transition-all duration-300">
            {/* Header Area (Profile moved here) */}
            <div className="p-8 pb-4">
                <h1 className="text-xl font-bold text-gray-900 mb-6">Employee</h1>

                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Welcome, {manager?.role || 'Manager'}</p>
                    <h2 className="text-lg font-bold text-gray-800">{manager?.name || 'User'}!</h2>
                </div>

                {/* Location Dropdown (RM) or Static (SM) */}
                <div className="relative mb-6">
                    {manager?.type === 'RM' ? (
                        <div className="relative group">
                            <select
                                value={selectedLocationId}
                                onChange={(e) => onFilterLocation(e.target.value)}
                                className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-700 uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition shadow-sm"
                            >
                                <option value="">All Locations</option>
                                {locations?.map((loc: any) => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                    ) : (
                        <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                            <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{location_name}</span>
                            <div className="bg-gray-100 p-1 rounded-md">
                                <span className="text-[10px] text-gray-500 font-semibold px-1">SM</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Average Progress */}
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

            {/* List Area */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                {supervisors?.map((spv: any, index: number) => (
                    <div
                        key={spv.id}
                        onClick={() => onSelect(spv.id)}
                        className={`relative p-5 rounded-2xl cursor-pointer transition-all border-l-4 shadow-sm ${selectedId === spv.id
                            ? 'bg-white shadow-md border-l-primary border border-transparent ring-1 ring-gray-100'
                            : 'bg-white border-l-transparent hover:border-l-purple-200 border border-gray-50'
                            }`}
                        style={{ boxShadow: selectedId === spv.id ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : '' }}
                    >
                        {/* Top Performer Star */}
                        {spv.is_top_performer && (
                            <div className="absolute top-4 right-4 text-green-500">
                                <Star size={18} fill="currentColor" className="drop-shadow-sm" />
                            </div>
                        )}

                        <div className="mb-4 pr-6">
                            <h3 className="text-sm font-bold text-gray-800">{index + 1}. {spv.name} - {spv.role}</h3>
                        </div>

                        {/* Progress Bar & Value */}
                        <div className="space-y-2">
                            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                    className={`h-3 rounded-full transition-all duration-500 ${getProgressColor(spv.activity_percentage)}`}
                                    style={{ width: `${spv.activity_percentage}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-gray-400">Activity Percentage - {spv.activity_percentage}%</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
