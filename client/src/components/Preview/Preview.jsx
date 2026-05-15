import { useState, useCallback, useRef, useEffect } from 'react';
import { VscRefresh, VscPreview, VscLinkExternal, VscSync, VscSyncIgnored } from 'react-icons/vsc';
import { fetchAllFiles } from '../../services/api.js';
import { bootWebContainer, buildFileSystemTree, writeFilesToWebContainer } from '../../services/webcontainer.js';
import socket from '../../services/socket.js';
import './Preview.css';

export default function Preview() {
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [statusText, setStatusText] = useState('');

    const iframeRef = useRef(null);
    const debounceRef = useRef(null);
    const webcontainerRef = useRef(null);
    const serverProcessRef = useRef(null);
    const initializationRef = useRef(false);

    /* ── Initialize WebContainer and Dev Server ────────────────── */
    const initWebContainer = useCallback(async () => {
        if (initializationRef.current) return;
        initializationRef.current = true;

        setLoading(true);
        setError(null);
        setStatusText('Booting WebContainer...');

        // WebContainer requires cross-origin isolation (COOP + COEP headers)
        if (!window.crossOriginIsolated) {
            setError(
                'Page is not cross-origin isolated. Ensure the Vite dev server is running with COOP and COEP headers (already set in vite.config.js). Try a hard refresh (Ctrl+Shift+R).'
            );
            setLoading(false);
            initializationRef.current = false;
            return;
        }

        try {
            // 1. Boot WC
            const wc = await bootWebContainer();
            webcontainerRef.current = wc;

            // 2. Listen for server-ready event
            wc.on('server-ready', (port, url) => {
                console.log(`[WC] Server ready at ${url}`);
                setPreviewUrl(url);
                setLastUpdated(new Date());
                setLoading(false);
                setStatusText('');
            });

            wc.on('error', (err) => {
                console.error('[WC] WebContainer error:', err);
                setError(err.message);
                setLoading(false);
            });

            // 3. Fetch all files and mount them
            setStatusText('Fetching project files...');
            const allFiles = await fetchAllFiles();
            const tree = buildFileSystemTree(allFiles);

            setStatusText('Mounting files...');
            await writeFilesToWebContainer(wc, tree);

            // 4. Start Server depending on project type
            const hasRootPackageJson = ('package.json' in allFiles);
            const hasClientPackageJson = ('client/package.json' in allFiles);

            if (serverProcessRef.current) {
                serverProcessRef.current.kill();
            }

            if (hasRootPackageJson || hasClientPackageJson) {
                const targetDir = hasRootPackageJson ? '.' : 'client';
                const spawnOpts = targetDir === '.' ? undefined : { cwd: 'client' };

                setStatusText(`Installing dependencies in ${targetDir}...`);
                const installProcess = await wc.spawn('npm', ['install'], spawnOpts);

                installProcess.output.pipeTo(new WritableStream({
                    write(data) { console.log(`[WC npm install] ${data}`); }
                }));

                const installExitCode = await installProcess.exit;
                if (installExitCode !== 0) {
                    throw new Error('Installation failed');
                }

                setStatusText('Starting dev server...');
                // Force port 3000 to avoid collision with CodeX client on port 5173
                serverProcessRef.current = await wc.spawn('npm', ['run', 'dev', '--', '--port', '3000'], spawnOpts);
                serverProcessRef.current.output.pipeTo(new WritableStream({
                    write(data) { console.log(`[WC dev] ${data}`); }
                }));
            } else {
                // Static files only, use a simple server
                setStatusText('Starting static server...');
                // We can use npx serve
                serverProcessRef.current = await wc.spawn('npx', ['-y', 'serve', '.']);
                serverProcessRef.current.output.pipeTo(new WritableStream({
                    write(data) { console.log(`[WC serve] ${data}`); }
                }));
            }

        } catch (err) {
            console.error('[Preview] Initialization error:', err);
            setError(err.message || 'Failed to load preview');
            setLoading(false);
            initializationRef.current = false;
        }
    }, []);

    // Init on mount
    useEffect(() => {
        initWebContainer();
    }, [initWebContainer]);

    /* ── Handle file changes ──────────────────────── */
    // Refresh iframe if server is running, or reload entirely if package.json changed
    const handleRefresh = useCallback(async () => {
        if (!webcontainerRef.current || !previewUrl) return;

        try {
            setLoading(true);
            const allFiles = await fetchAllFiles();
            const tree = buildFileSystemTree(allFiles);
            await writeFilesToWebContainer(webcontainerRef.current, tree);

            // Reload the iframe to see changes (some frameworks hot-reload automatically though)
            if (iframeRef.current) {
                iframeRef.current.src = iframeRef.current.src;
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[Preview] Refresh error:', err);
        } finally {
            setLoading(false);
        }
    }, [previewUrl]);

    const debouncedRefresh = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            handleRefresh();
        }, 800);
    }, [handleRefresh]);

    /* ── Listen for real-time file changes ──────────────── */
    useEffect(() => {
        function handleFilesChanged(_data) {
            if (autoRefresh) {
                debouncedRefresh();
            }
        }

        socket.on('files:changed', handleFilesChanged);

        return () => {
            socket.off('files:changed', handleFilesChanged);
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [autoRefresh, debouncedRefresh]);

    /* ── Open preview in new window ────────────────────── */
    const openInNewTab = useCallback(() => {
        if (!previewUrl) return;
        window.open(previewUrl, '_blank');
    }, [previewUrl]);

    return (
        <div className="preview">
            {/* ── Toolbar ───────────────────────────────── */}
            <div className="preview__toolbar">
                <div className="preview__toolbar-left">
                    <button
                        className="preview__tool-btn"
                        onClick={handleRefresh}
                        disabled={loading || !previewUrl}
                        title="Reload iframe content"
                    >
                        <VscRefresh size={14} className={loading ? 'spin' : ''} />
                    </button>
                    <button
                        className={`preview__tool-btn ${autoRefresh ? 'preview__tool-btn--active' : ''}`}
                        onClick={() => setAutoRefresh((v) => !v)}
                        title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    >
                        {autoRefresh ? <VscSync size={14} /> : <VscSyncIgnored size={14} />}
                    </button>
                </div>

                <div className="preview__toolbar-center">
                    <div className="preview__url-bar" style={{ width: previewUrl ? '100%' : 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <VscPreview size={12} style={{ minWidth: '12px' }} />
                        <span className="preview__url-text">
                            {previewUrl || 'No preview'}
                        </span>
                    </div>
                </div>

                <div className="preview__toolbar-right">
                    {lastUpdated && (
                        <span className="preview__timestamp">
                            {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        className="preview__tool-btn"
                        onClick={openInNewTab}
                        disabled={!previewUrl}
                        title="Open in new tab"
                    >
                        <VscLinkExternal size={14} />
                    </button>
                </div>
            </div>

            {/* ── Content ──────────────────────────────── */}
            <div className="preview__content">
                {loading && !previewUrl && (
                    <div className="preview__loading">
                        <div className="preview__spinner" />
                        <span>{statusText || 'Loading preview…'}</span>
                    </div>
                )}

                {error && !previewUrl && !loading && (
                    <div className="preview__error">
                        <VscPreview className="preview__error-icon" />
                        <span className="preview__error-text">{error}</span>
                        <button className="preview__retry-btn" onClick={() => { initializationRef.current = false; initWebContainer(); }}>
                            <VscRefresh size={12} />
                            Retry Boot
                        </button>
                    </div>
                )}

                {previewUrl && (
                    <iframe
                        ref={iframeRef}
                        className="preview__frame"
                        src={previewUrl}
                        title="Live Preview"
                        allow="cross-origin-isolated"
                        credentialless="true"
                    />
                )}
            </div>

            {/* ── Auto-refresh indicator ───────────────── */}
            {loading && previewUrl && (
                <div className="preview__refresh-indicator">
                    <div className="preview__refresh-bar" />
                </div>
            )}
        </div>
    );
}
