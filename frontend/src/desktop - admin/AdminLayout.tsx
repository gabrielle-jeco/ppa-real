import React from 'react';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            <main className="h-screen overflow-hidden bg-gray-50">
                {children}
            </main>
        </div>
    );
}
