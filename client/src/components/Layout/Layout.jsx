import { useRef, useState, useEffect } from 'react';
import { VscSettingsGear, VscRemote, VscFolderOpened, VscSignOut, VscChromeClose, VscRefresh } from 'react-icons/vsc';
import { useFiles } from '../../context/FileContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePreview } from '../../context/PreviewContext.jsx';
import { useInlineSuggestion } from '../../context/InlineSuggestionContext.jsx';
import FileExplorer from '../FileExplorer/FileExplorer.jsx';
import TabBar from '../Editor/TabBar.jsx';
import Editor from '../Editor/Editor.jsx';
import Chat from '../Chat/Chat.jsx';
import Terminal from '../Terminal/Terminal.jsx';
import ThemeToggle from '../common/ThemeToggle.jsx';
import './Layout.css';

export default function Layout() {
    const { projectRoot } = useFiles();
    const { logout, user } = useAuth();
    const { serverUrl, previewOpen, openPreview, closePreview } = usePreview();
    const { enabled: inlineEnabled, toggle: toggleInline } = useInlineSuggestion();

    const iframeRef = useRef(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsRef = useRef(null);

    const handleRefreshPreview = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target)) {
                setSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="layout">
            {/* ── Preview Overlay ──────────────────────────────── */}
            {previewOpen && serverUrl && (
                <div className="layout__preview-overlay">
                    <div className="layout__preview-toolbar">
                        <span className="layout__preview-url">
                            🔗 {serverUrl.replace(/^https?:\/\//, '')}
                        </span>
                        <div className="layout__preview-actions">
                            <button
                                className="icon-btn"
                                title="Reload preview"
                                onClick={handleRefreshPreview}
                            >
                                <VscRefresh size={14} />
                            </button>
                            <button
                                className="icon-btn"
                                title="Close preview"
                                onClick={closePreview}
                            >
                                <VscChromeClose size={14} />
                            </button>
                        </div>
                    </div>
                    <iframe
                        ref={iframeRef}
                        src={serverUrl}
                        className="layout__preview-frame"
                        title="App Preview"
                        allow="cross-origin-isolated; scripts; forms; popups; same-origin"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    />
                </div>
            )}

            {/* ── Header ──────────────────────────────────── */}
            <header className="layout__header">
                <div className="layout__logo">
                    <div className="layout__logo-icon">C</div>
                    <span>Codex</span>
                </div>
                <div className="layout__header-actions">
                    {user && (
                        <span className="layout__user-email">{user.email}</span>
                    )}

                    {/* ── Theme Toggle ───────────────────────────── */}
                    <ThemeToggle />

                    {/* ── Settings dropdown ──────────────────────── */}
                    <div className="settings-dropdown" ref={settingsRef}>
                        <button
                            className={`icon-btn${settingsOpen ? ' icon-btn--active' : ''}`}
                            title="Settings"
                            id="settings-btn"
                            onClick={() => setSettingsOpen(o => !o)}
                            aria-haspopup="true"
                            aria-expanded={settingsOpen}
                        >
                            <VscSettingsGear size={16} />
                        </button>

                        {settingsOpen && (
                            <div className="settings-dropdown__menu" role="menu">
                                <div className="settings-dropdown__header">Settings</div>

                                {/* ── Inline Suggestion row ─────── */}
                                <div className="settings-dropdown__item" role="menuitem">
                                    <div className="settings-dropdown__item-info">
                                        <span className="settings-dropdown__item-icon">⚡</span>
                                        <div>
                                            <div className="settings-dropdown__item-label">
                                                Inline Suggestions
                                            </div>
                                            <div className="settings-dropdown__item-desc">
                                                AI ghost-text as you type
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mini slider toggle */}
                                    <button
                                        className={`settings-toggle${inlineEnabled ? ' settings-toggle--on' : ''}`}
                                        onClick={toggleInline}
                                        aria-label={inlineEnabled ? 'Disable inline suggestions' : 'Enable inline suggestions'}
                                        title={inlineEnabled ? 'Inline Suggestions: ON' : 'Inline Suggestions: OFF'}
                                        id="inline-suggestion-settings-toggle"
                                    >
                                        <span className="settings-toggle__knob" />
                                    </button>
                                </div>

                                <div className="settings-dropdown__divider" />

                                {/* Status indicator */}
                                <div className="settings-dropdown__status">
                                    <span
                                        className={`settings-dropdown__dot${inlineEnabled ? ' settings-dropdown__dot--on' : ''}`}
                                    />
                                    Inline Suggestions {inlineEnabled ? 'ON — uses tokens' : 'OFF'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Logout ────────────────────────────────── */}
                    <button
                        className="icon-btn icon-btn--logout"
                        title="Logout"
                        onClick={logout}
                    >
                        <VscSignOut size={16} />
                    </button>
                </div>
            </header>

            {/* ── Sidebar ─────────────────────────────────── */}
            <aside className="layout__sidebar">
                <FileExplorer />
            </aside>

            {/* ── Editor area ─────────────────────────────── */}
            <main className="layout__editor">
                <div className="layout__editor-main">
                    <TabBar />
                    <Editor />
                </div>
                <div className="layout__editor-bottom">
                    <div className="panel-header">
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button className="bottom-tab-btn bottom-tab-btn--active">
                                Terminal
                            </button>
                        </div>
                    </div>
                    <Terminal />
                </div>
            </main>

            {/* ── Right panel (Chat) ──────────────────────── */}
            <aside className="layout__right">
                <Chat />
            </aside>

            {/* ── Status bar ──────────────────────────────── */}
            <footer className="layout__statusbar">
                <div className="layout__statusbar-left">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <VscRemote size={14} /> Codex
                    </span>
                </div>
                <div className="layout__statusbar-right">
                    {projectRoot && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.7 }}>
                            <VscFolderOpened size={12} />
                            {projectRoot.split(/[\\\/]/).pop()}
                        </span>
                    )}
                    <span>Ready</span>
                </div>
            </footer>
        </div>
    );
}
