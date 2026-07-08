import React, { type ReactNode, useState, useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';

interface CrewLayoutProps {
    children: ReactNode;
    title?: string;
    showBack?: boolean;
    onBack?: () => void;
    allowScroll?: boolean;
}

const CrewLayout: React.FC<CrewLayoutProps> = ({ children, title = "Dasbor", showBack = false, onBack, allowScroll = true }) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            if (scrollContainerRef.current) {
                // Shrink threshold at 20px
                setIsScrolled(scrollContainerRef.current.scrollTop > 20);
            }
        };

        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
        }
        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
        };
    }, []);

    return (
        // Root App Shell: Fixed, No Window Scroll, Dual-Color Background (Blue Header, White Body)
        <div className="fixed inset-0 font-sans text-gray-800 overflow-hidden bg-gray-50">
            {/* Blue Background Top Half */}
            <div className="absolute top-0 left-0 right-0 h-1/3 bg-blue-600 z-0"></div>

            {/* Header: Dynamic Sticky (Z-30) */}
            <header
                className={`absolute top-0 left-0 right-0 text-white flex flex-col justify-end z-30 transition-all duration-300 ease-in-out ${isScrolled ? 'h-16 px-6 pb-4 bg-blue-600 shadow-md' : 'h-24 px-6 pb-6 bg-transparent'
                    }`}
            >
                <div className="relative flex items-center justify-center w-full">
                    {showBack && (
                        <button
                            onClick={onBack}
                            className="absolute left-0 p-1 -ml-2 hover:bg-white/10 rounded-full transition"
                        >
                            <ChevronLeft size={28} />
                        </button>
                    )}
                    <h1 className={`font-bold transition-all duration-300 text-center ${isScrolled ? 'text-lg' : 'text-xl'
                        }`}>
                        {title}
                    </h1>
                </div>
            </header>

            {/* Internal Scroll View: Z-10 Under Header */}
            <div
                ref={scrollContainerRef}
                className={`absolute inset-0 z-10 overflow-x-hidden ${allowScroll ? 'overflow-y-auto overscroll-none' : 'overflow-y-hidden'}`}
            >
                {/* Spacer - Remains constant to push content down initially */}
                <div className="h-24 w-full shrink-0"></div>

                {/* Main Content */}
                <main className={`bg-gray-50 rounded-t-[30px] w-full px-6 py-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] relative z-20 ${allowScroll ? 'min-h-[calc(100vh-6rem)]' : 'h-[calc(100vh-6rem)] overflow-hidden flex flex-col'}`}>
                    {children}

                    {/* Bottom Padding only needed for scrollable main */}
                    {allowScroll && <div className="h-20"></div>}
                </main>
            </div>
        </div>
    );
};

export default CrewLayout;
