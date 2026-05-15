import { createContext, useContext, useState } from 'react';

const InlineSuggestionContext = createContext(null);

export function InlineSuggestionProvider({ children }) {
    // Default OFF — it's a heavy feature
    const [enabled, setEnabled] = useState(() => {
        const saved = localStorage.getItem('codex-inline-suggestions');
        return saved === 'true';
    });

    const toggle = () => {
        setEnabled(prev => {
            const next = !prev;
            localStorage.setItem('codex-inline-suggestions', String(next));
            return next;
        });
    };

    return (
        <InlineSuggestionContext.Provider value={{ enabled, toggle }}>
            {children}
        </InlineSuggestionContext.Provider>
    );
}

export function useInlineSuggestion() {
    return useContext(InlineSuggestionContext);
}
