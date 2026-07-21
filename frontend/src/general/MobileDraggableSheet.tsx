import React, { useRef, useState } from 'react';

interface MobileDraggableSheetProps {
    children: React.ReactNode;
    className?: string;
    handleClassName?: string;
    topInset?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function MobileDraggableSheet({
    children,
    className = '',
    handleClassName = '',
    topInset = 96,
}: MobileDraggableSheetProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef({ startY: 0, startLift: 0, maxLift: 0, lastY: 0 });
    const didDragRef = useRef(false);
    const [lift, setLift] = useState(0);
    const [baseHeight, setBaseHeight] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const measure = () => {
        const rect = sheetRef.current?.getBoundingClientRect();
        if (!rect) return { base: 0, max: 0 };

        return {
            base: Math.max(0, rect.height - lift),
            max: Math.max(0, lift + rect.top - topInset),
        };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        const measured = measure();
        didDragRef.current = false;
        dragRef.current = {
            startY: event.clientY,
            lastY: event.clientY,
            startLift: lift,
            maxLift: measured.max,
        };
        setBaseHeight(measured.base);
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isDragging) return;

        const delta = dragRef.current.startY - event.clientY;
        if (Math.abs(delta) > 4) didDragRef.current = true;
        dragRef.current.lastY = event.clientY;
        setLift(clamp(dragRef.current.startLift + delta, 0, dragRef.current.maxLift));
    };

    const finishDrag = () => {
        if (!isDragging) return;

        const movement = dragRef.current.startY - dragRef.current.lastY;
        const currentLift = clamp(dragRef.current.startLift + movement, 0, dragRef.current.maxLift);
        const shouldExpand = movement > 18 || (movement >= -18 && currentLift >= dragRef.current.maxLift * 0.4);
        setLift(shouldExpand ? dragRef.current.maxLift : 0);
        setIsDragging(false);
    };

    const toggleSheet = () => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }

        if (lift > 0) {
            setLift(0);
            return;
        }

        const measured = measure();
        setBaseHeight(measured.base);
        setLift(measured.max);
    };

    const expanded = lift > 0;

    return (
        <div
            ref={sheetRef}
            className={`${className} z-20`}
            style={{
                transform: `translate3d(0, -${lift}px, 0)`,
                height: expanded && baseHeight ? `${baseHeight + lift}px` : undefined,
                flex: expanded ? '0 0 auto' : undefined,
                transition: isDragging ? 'none' : 'transform 220ms ease-out, height 220ms ease-out',
                willChange: 'transform, height',
            }}
        >
            <button
                type="button"
                aria-label={expanded ? 'Turunkan panel pekerjaan' : 'Tarik panel pekerjaan ke atas'}
                aria-expanded={expanded}
                className={`flex w-full cursor-grab touch-none select-none justify-center active:cursor-grabbing ${handleClassName}`}
                onClick={toggleSheet}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
            >
                <span className="h-1.5 w-12 rounded-full bg-blue-600" />
            </button>
            {children}
        </div>
    );
}
