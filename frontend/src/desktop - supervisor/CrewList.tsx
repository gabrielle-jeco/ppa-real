import React, { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import DesktopCrewCard from '../general/DesktopCrewCard';
import { formatDisplayNumber } from '../general/numberFormat';

interface CrewListProps {
    data: any;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

export default function CrewList({ data, selectedId, onSelect }: CrewListProps) {
    const { supervisor, location_name, location_avg_progress, crews } = data;
    const [searchTerm, setSearchTerm] = useState('');
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('id-ID');
    const filteredCrews = (crews || []).filter((crew: { name?: string; id?: string | number }) =>
        String(crew.name || '').toLocaleLowerCase('id-ID').includes(normalizedSearch)
        || String(crew.id || '').toLocaleLowerCase('id-ID').includes(normalizedSearch)
    );
    return (
        <div className="bg-white h-full border-r border-gray-200 flex flex-col w-full md:w-64 lg:w-64 xl:w-64 2xl:w-96 flex-shrink-0 z-10 transition-all duration-300">
            {/* Header Area */}
            <div className="p-8 pb-4">
                <h1 className="text-xl font-bold text-gray-900 mb-6">Karyawan</h1>

                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Selamat datang, Supervisor Fashion</p>
                    <h2 className="text-lg font-bold text-gray-800">{supervisor?.name || 'User'}!</h2>
                </div>

                {/* Location (Static for Supervisor) */}
                <div className="relative mb-6">
                    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{location_name}</span>
                        <ChevronDown size={16} className="text-gray-400" />
                    </div>
                </div>

                {/* Average Task Progress */}
                <div className="mb-2">
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                            className="bg-primary h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${location_avg_progress}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-500">Rata-rata Penyelesaian Tugas : <span className="font-medium text-gray-800">{formatDisplayNumber(location_avg_progress, '0')}%</span></p>
                </div>

                <div className="border-b border-gray-200 mt-4"></div>

                <div className="relative mt-4">
                    <input
                        type="search"
                        placeholder="Cari nama atau NIK..."
                        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-11 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-purple-100"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <Search
                        size={18}
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                </div>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                {filteredCrews.length === 0 && (
                    <div className="py-10 text-center text-sm text-gray-400">Service crew tidak ditemukan.</div>
                )}

                {filteredCrews.map((crew: any, index: number) => (
                    <DesktopCrewCard
                        key={crew.id}
                        crew={crew}
                        index={index}
                        selected={selectedId === String(crew.id)}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}
