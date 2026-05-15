import { createContext, useContext, useState } from 'react';

const PreviewContext = createContext(null);

export function PreviewProvider({ children }) {
    const [serverUrl, setServerUrl] = useState(null);
    const [serverLive, setServerLive] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);

    const markServerReady = (url) => {
        setServerUrl(url);
        setServerLive(true);
        setPreviewOpen(true); // auto-open preview the moment a server is detected
    };

    const openPreview = () => setPreviewOpen(true);
    const closePreview = () => setPreviewOpen(false);
    const togglePreview = () => setPreviewOpen((v) => !v);

    return (
        <PreviewContext.Provider value={{ serverUrl, serverLive, previewOpen, markServerReady, openPreview, closePreview, togglePreview }}>
            {children}
        </PreviewContext.Provider>
    );
}

export function usePreview() {
    const ctx = useContext(PreviewContext);
    if (!ctx) throw new Error('usePreview must be used within a PreviewProvider');
    return ctx;
}
