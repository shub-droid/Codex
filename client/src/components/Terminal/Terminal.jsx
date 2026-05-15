import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import socket from '../../services/socket.js';
import { useFiles } from '../../context/FileContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import {
    VscTerminal,
    VscCircleFilled,
    VscTrash,
    VscAdd,
    VscDebugDisconnect,
} from 'react-icons/vsc';
import './Terminal.css';

/* ─────────────────────────────────────────────────────────
   xterm.js colour palettes
   ───────────────────────────────────────────────────────── */
const DARK_THEME = {
    background:          '#0d1117',
    foreground:          '#e6edf3',
    cursor:              '#818cf8',
    cursorAccent:        '#0d1117',
    selectionBackground: 'rgba(129,140,248,0.25)',
    black:   '#484f58', red:     '#ff7b72',
    green:   '#3fb950', yellow:  '#d29922',
    blue:    '#58a6ff', magenta: '#bc8cff',
    cyan:    '#39c5cf', white:   '#b1bac4',
    brightBlack:   '#6e7681', brightRed:     '#ffa198',
    brightGreen:   '#56d364', brightYellow:  '#e3b341',
    brightBlue:    '#79c0ff', brightMagenta: '#d2a8ff',
    brightCyan:    '#56d4dd', brightWhite:   '#f0f6fc',
};

const LIGHT_THEME = {
    background:          '#f6f8fa',
    foreground:          '#1c2333',
    cursor:              '#4f46e5',
    cursorAccent:        '#f6f8fa',
    selectionBackground: 'rgba(79,70,229,0.2)',
    black:   '#57606a', red:     '#cf222e',
    green:   '#116329', yellow:  '#953800',
    blue:    '#0550ae', magenta: '#6639ba',
    cyan:    '#1b7c83', white:   '#424a53',
    brightBlack:   '#6e7781', brightRed:     '#a40e26',
    brightGreen:   '#1a7f37', brightYellow:  '#633c01',
    brightBlue:    '#0969da', brightMagenta: '#8250df',
    brightCyan:    '#1b7c83', brightWhite:   '#24292f',
};

/* ─────────────────────────────────────────────────────────
   RealTerminal — drives a node-pty shell via Socket.IO
   ───────────────────────────────────────────────────────── */
export default function Terminal() {
    const containerRef  = useRef(null);  // DOM node for xterm.js
    const xtermRef      = useRef(null);  // XTerm instance
    const fitRef        = useRef(null);  // FitAddon instance
    const initialized   = useRef(false);
    const resizeObsRef  = useRef(null);

    const { projectRoot } = useFiles();
    const { isDark } = useTheme();

    const [status, setStatus]   = useState('connecting');
    const [pid, setPid]         = useState(null);
    const [cwd, setCwd]         = useState('');

    // ── helpers ──────────────────────────────────────────────────
    const writeToTerm = useCallback((data) => {
        xtermRef.current?.write(data);
    }, []);

    const clearTerminal = useCallback(() => {
        xtermRef.current?.clear();
    }, []);

    const restartTerminal = useCallback((newCwd) => {
        if (!xtermRef.current) return;
        xtermRef.current.clear();
        setStatus('connecting');
        setPid(null);
        socket.emit('terminal:create', {
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
        });
    }, []);

    // ── mount xterm.js once ───────────────────────────────────────
    useEffect(() => {
        if (initialized.current || !containerRef.current) return;
        initialized.current = true;

        const xterm = new XTerm({
            cursorBlink: true,
            allowProposedApi: true,
            theme: isDark ? DARK_THEME : LIGHT_THEME,
            fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.5,
            convertEol: false,
            scrollback: 10000,
            allowTransparency: true,
        });

        const fit        = new FitAddon();
        const webLinks   = new WebLinksAddon();

        xterm.loadAddon(fit);
        xterm.loadAddon(webLinks);
        xterm.open(containerRef.current);
        fit.fit();

        xtermRef.current = xterm;
        fitRef.current   = fit;

        // Resize observer keeps xterm fitted whenever the panel size changes
        const ro = new ResizeObserver(() => {
            try { fit.fit(); } catch (_) {}
        });
        ro.observe(containerRef.current);
        resizeObsRef.current = ro;

        // Forward keystrokes to server PTY
        xterm.onData((data) => {
            socket.emit('terminal:input', data);
        });

        // Forward resize to server PTY
        xterm.onResize(({ cols, rows }) => {
            socket.emit('terminal:resize', { cols, rows });
        });

        // Ask server to spawn the shell
        socket.emit('terminal:create', {
            cols: xterm.cols,
            rows: xterm.rows,
        });

        return () => {
            ro.disconnect();
            xterm.dispose();
            initialized.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── update xterm theme when dark/light mode is toggled ────────
    useEffect(() => {
        if (xtermRef.current) {
            xtermRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
        }
    }, [isDark]);

    // ── socket event listeners ────────────────────────────────────
    useEffect(() => {
        const onReady = ({ pid: p, cwd: c }) => {
            setStatus('ready');
            setPid(p);
            if (c) setCwd(c);
        };

        const onOutput = (data) => {
            writeToTerm(data);
        };

        const onExit = ({ exitCode }) => {
            writeToTerm(`\r\n\x1b[2m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
            setStatus('disconnected');
            setPid(null);
        };

        const onError = ({ message }) => {
            writeToTerm(`\r\n\x1b[31m✖ ${message}\x1b[0m\r\n`);
            setStatus('error');
        };

        const onSocketConnect = () => {
            if (xtermRef.current) {
                writeToTerm('\r\n\x1b[33m[Reconnected — starting new shell]\x1b[0m\r\n');
                setStatus('connecting');
                socket.emit('terminal:create', {
                    cols: xtermRef.current.cols,
                    rows: xtermRef.current.rows,
                });
            }
        };

        // Server tells us the project root changed (user opened a different folder)
        // This DOES restart the shell in the new directory.
        const onChdir = ({ dir } = {}) => {
            if (dir) setCwd(dir);
            if (xtermRef.current) {
                writeToTerm(`\r\n\x1b[36m[Codex] Switching project to ${dir}\x1b[0m\r\n`);
                setStatus('connecting');
                socket.emit('terminal:create', {
                    cols: xtermRef.current.cols,
                    rows: xtermRef.current.rows,
                });
            }
        };

        // Server detected a cd command in the terminal output — just update the label.
        // Do NOT restart the shell; the shell already changed directory itself.
        const onCwd = ({ dir } = {}) => {
            if (dir) setCwd(dir);
        };

        const onSocketDisconnect = () => {
            writeToTerm('\r\n\x1b[31m[Connection to server lost…]\x1b[0m\r\n');
            setStatus('disconnected');
        };

        socket.on('terminal:ready',      onReady);
        socket.on('terminal:output',     onOutput);
        socket.on('terminal:exit',       onExit);
        socket.on('terminal:error',      onError);
        socket.on('connect',             onSocketConnect);
        socket.on('disconnect',          onSocketDisconnect);
        socket.on('terminal:chdir',      onChdir);
        socket.on('terminal:cwd',        onCwd);

        return () => {
            socket.off('terminal:ready',     onReady);
            socket.off('terminal:output',    onOutput);
            socket.off('terminal:exit',      onExit);
            socket.off('terminal:error',     onError);
            socket.off('connect',            onSocketConnect);
            socket.off('disconnect',         onSocketDisconnect);
            socket.off('terminal:chdir',     onChdir);
            socket.off('terminal:cwd',       onCwd);
        };
    }, [writeToTerm, projectRoot]);

    // ── status indicator ─────────────────────────────────────────
    const statusDot = {
        connecting:   { color: '#d29922', label: 'Connecting…' },
        ready:        { color: '#3fb950', label: cwd ? cwd.split(/[\\/]/).pop() || 'Shell ready' : 'Shell ready' },
        error:        { color: '#ff7b72', label: 'Error' },
        disconnected: { color: '#6e7681', label: 'Disconnected' },
    }[status] ?? { color: '#6e7681', label: status };

    return (
        <div className="terminal-panel">
            {/* ── Top bar ───────────────────────────────────── */}
            <div className="terminal-panel__topbar">
                <div className="terminal-panel__topbar-left">
                    <VscTerminal size={14} />
                    <span className="terminal-panel__title">Terminal</span>
                    <span className="terminal-panel__badge" style={{ '--dot-color': statusDot.color }}>
                        <VscCircleFilled size={8} style={{ color: statusDot.color }} />
                        {statusDot.label}
                    </span>
                </div>

                <div className="terminal-panel__topbar-right">
                    <button
                        id="terminal-clear-btn"
                        className="terminal-panel__icon-btn"
                        title="Clear terminal"
                        onClick={clearTerminal}
                    >
                        <VscTrash size={14} />
                    </button>
                    <button
                        id="terminal-restart-btn"
                        className="terminal-panel__icon-btn"
                        title="Restart shell"
                        onClick={restartTerminal}
                    >
                        <VscAdd size={14} />
                    </button>
                    {status === 'disconnected' && (
                        <button
                            id="terminal-reconnect-btn"
                            className="terminal-panel__icon-btn terminal-panel__icon-btn--warning"
                            title="Reconnect shell"
                            onClick={restartTerminal}
                        >
                            <VscDebugDisconnect size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── xterm.js canvas ───────────────────────────── */}
            <div
                id="terminal-xterm-container"
                className="terminal-panel__xterm"
                ref={containerRef}
            />
        </div>
    );
}
