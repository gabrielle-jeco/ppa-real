import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface ModalTransitionOptions {
    duration?: number;
    enabled?: boolean;
}

export default function useModalTransition(
    isOpen: boolean,
    { duration = 300, enabled = true }: ModalTransitionOptions = {},
) {
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [animateIn, setAnimateIn] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!enabled) {
            setShouldRender(isOpen);
            setAnimateIn(isOpen);
            return;
        }

        let timer = 0;
        if (isOpen) {
            setAnimateIn(false);
            setShouldRender(true);
        } else {
            setAnimateIn(false);
            timer = window.setTimeout(() => setShouldRender(false), duration);
        }

        return () => window.clearTimeout(timer);
    }, [duration, enabled, isOpen]);

    useLayoutEffect(() => {
        if (!enabled || !isOpen || !shouldRender) return;

        contentRef.current?.getBoundingClientRect();
        const frame = window.requestAnimationFrame(() => setAnimateIn(true));
        return () => window.cancelAnimationFrame(frame);
    }, [enabled, isOpen, shouldRender]);

    return { shouldRender, animateIn, contentRef };
}
