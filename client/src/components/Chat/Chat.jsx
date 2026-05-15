import { useState, useRef, useCallback, useEffect } from 'react';
import {
    VscSend, VscWand, VscComment, VscClearAll,
    VscCheck, VscClose, VscTerminal, VscFolder,
    VscFile, VscJson, VscSymbolMisc,
} from 'react-icons/vsc';
import { useChat }  from '../../context/ChatContext.jsx';
import { useFiles } from '../../context/FileContext.jsx';
import { planGeneration, acceptPlan, runInTerminal, openFileAPI } from '../../services/api.js';
import socket from '../../services/socket.js';
import './Chat.css';

/* ── helpers ──────────────────────────────────────────── */
function fileIcon(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return <VscSymbolMisc style={{ color: '#f0db4f' }} />;
    if (ext === 'json')  return <VscJson style={{ color: '#5bb85d' }} />;
    if (ext === 'html')  return <VscFile style={{ color: '#e44d26' }} />;
    if (ext === 'css')   return <VscFile style={{ color: '#58a6ff' }} />;
    return <VscFile />;
}

function stackBadge(stack) {
    const map = {
        html:      { label: 'HTML',      color: '#e44d26' },
        react:     { label: 'React',     color: '#61dafb' },
        fullstack: { label: 'Fullstack', color: '#6366f1' },
    };
    const s = map[stack] || { label: stack, color: '#8b949e' };
    return (
        <span className="chat-preview__badge" style={{ background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44` }}>
            {s.label}
        </span>
    );
}

/* ── Main component ───────────────────────────────────── */
export default function Chat() {
    const { messages, isLoading, sendMessage, clearChat, bottomRef, generationProgress, setIsLoading, setGenerationProgress } = useChat();
    const { refreshTree } = useFiles();

    const [input,        setInput]        = useState('');
    const [mode,         setMode]         = useState('chat');   // 'chat' | 'generate'
    const [pendingPlan,  setPendingPlan]  = useState(null);     // plan waiting for accept/reject
    const [accepting,    setAccepting]    = useState(false);    // phase 2 in progress
    const [runCommand,   setRunCommand]   = useState('');       // command for most recent app
    const [terminalCwd,  setTerminalCwd]  = useState('');       // current terminal directory
    const [projectHistory, setProjectHistory] = useState([]);  // all accepted projects
    //  Each entry: { label, keywords: string[], cmd: string, cwd: string }

    const textareaRef  = useRef(null);
    const generatingRef = useRef(false);  // prevents concurrent generate calls

    /* ── Track terminal CWD via socket events ───────────────── */
    useEffect(() => {
        // terminal:ready — initial CWD when shell first spawns
        const onReady  = ({ cwd })      => { if (cwd) setTerminalCwd(cwd); };
        // terminal:chdir — project root changed (full shell restart)
        const onChdir  = ({ dir } = {}) => { if (dir) setTerminalCwd(dir); };
        // terminal:cwd — user cd’d inside the terminal (no restart, just tracking)
        const onCwd    = ({ dir } = {}) => { if (dir) setTerminalCwd(dir); };

        socket.on('terminal:ready', onReady);
        socket.on('terminal:chdir', onChdir);
        socket.on('terminal:cwd',   onCwd);
        return () => {
            socket.off('terminal:ready', onReady);
            socket.off('terminal:chdir', onChdir);
            socket.off('terminal:cwd',   onCwd);
        };
    }, []);

    /* ── Phase 1: plan ─────────────────────────────────────────────── */
    const handleGenerate = useCallback(async () => {
        const text = input.trim();
        // Prevent duplicate concurrent calls and empty input
        if (!text || isLoading || accepting || generatingRef.current) return;

        // Clear input IMMEDIATELY (synchronous) so a second Enter press sees empty
        setInput('');
        generatingRef.current = true;

        // Show user message in chat
        sendMessage(text, { skipAI: true });

        setIsLoading(true);
        setGenerationProgress({ phase: 'planning', message: 'Analysing your request…' });

        try {
            const plan = await planGeneration(text);
            if (!plan || !plan.planId) throw new Error('No plan returned from server');
            setPendingPlan(plan);
            if (plan.runCommand) setRunCommand(plan.runCommand);
        } catch (err) {
            const msg = err?.response?.data?.error || err.message || 'Unknown error';
            sendMessage(`❌ Planning failed: ${msg}\n\nTry again or rephrase your request.`, { role: 'assistant', skipAI: true });
        } finally {
            setIsLoading(false);
            setGenerationProgress(null);
            generatingRef.current = false;
        }
    }, [input, isLoading, accepting, sendMessage, setIsLoading, setGenerationProgress]);

    /* ── Phase 2: accept ───────────────────────────────────────── */
    const handleAccept = useCallback(async () => {
        if (!pendingPlan || accepting) return;
        const { planId, runCommand: cmd, files: planFiles, explanation } = pendingPlan;
        setAccepting(true);
        setIsLoading(true);
        setGenerationProgress({ phase: 'generating', message: 'Generating file content…' });

        try {
            const result = await acceptPlan(planId, terminalCwd || undefined);
            setPendingPlan(null);

            const ok    = result.files?.filter(f => f.success).length || 0;
            const total = result.files?.length || 0;
            await refreshTree();

            // Build an absolute-path run command so the command works from any directory
            const allPaths = [
                ...(planFiles  || []).map(f => f.path),
                ...(result.files || []).map(f => f.path),
            ];
            const htmlFile = allPaths.find(p => p?.endsWith?.('.html'));
            let effectiveCmd = cmd || '';
            if (htmlFile && terminalCwd) {
                const sep = terminalCwd.includes('\\') ? '\\' : '/';
                const abs = [terminalCwd.replace(/[/\\]+$/, ''), htmlFile.replace(/\//g, sep)].join(sep);
                // Note: start "path" on Windows treats the quoted arg as a window title.
                // start "" "path" is the correct form to open a file in its default app.
                effectiveCmd = `start "" "${abs}"`;
            } else if (!effectiveCmd && htmlFile) {
                effectiveCmd = `start "" "${htmlFile}"`;
            }

            // Success message with dim run hint
            const successText = `✅ Created ${ok}/${total} file(s) in \`${terminalCwd || 'projects'}\`` +
                (effectiveCmd ? `\n▸ To run: ${effectiveCmd}` : '');
            await sendMessage(successText, { role: 'assistant', skipAI: true });

            if (effectiveCmd) {
                setRunCommand(effectiveCmd);
                // Save to history so "run counter app" / "run portfolio" works later
                const kws = (explanation || '').toLowerCase()
                    .replace(/[^a-z\s]/g, '').split(/\s+/)
                    .filter(w => w.length > 2 && !['the','and','with','for','simple','basic','app','website','page','site','application'].includes(w));
                setProjectHistory(prev => [...prev, {
                    label:    explanation || 'app',
                    keywords: kws,
                    cmd:      effectiveCmd,
                    cwd:      terminalCwd,
                }]);
            }
        } catch (err) {
            await sendMessage(`❌ Generation failed: ${err.message}`, { role: 'assistant', skipAI: true });
            setPendingPlan(null);
        } finally {
            setAccepting(false);
            setIsLoading(false);
            setGenerationProgress(null);
        }
    }, [pendingPlan, accepting, terminalCwd, refreshTree, sendMessage, setIsLoading, setGenerationProgress]);

    /* ── Reject plan ───────────────────────────────────────────── */
    const handleReject = useCallback(() => {
        setPendingPlan(null);
        setRunCommand('');
        sendMessage('❌ Generation cancelled.', { role: 'assistant', skipAI: true });
    }, [sendMessage]);

    /* ── Auto-run in terminal ─────────────────────────────────── */
    const handleRun = useCallback(async (cmd) => {
        if (!cmd) return;

        // Extract the absolute file path from start "" "path" commands
        const htmlMatch = cmd.match(/start\s+""\s+"([^"]+\.html)"/i);
        if (htmlMatch) {
            // Use server-side exec so the OS can launch the default browser
            // (PTY subprocesses often can't open GUI apps)
            try {
                await openFileAPI(htmlMatch[1]);
                sendMessage(`▶ Opening: \`${htmlMatch[1]}\``, { role: 'assistant', skipAI: true });
            } catch (err) {
                // Fallback to PTY if server-side open fails
                socket.emit('terminal:run', { command: cmd });
                sendMessage(`▶ Running: \`${cmd}\``, { role: 'assistant', skipAI: true });
            }
        } else {
            // Non-HTML commands (npm run dev, etc.) — run in the terminal as usual
            socket.emit('terminal:run', { command: cmd });
            sendMessage(`▶ Running: \`${cmd}\``, { role: 'assistant', skipAI: true });
        }
    }, [sendMessage]);

    /* ── Chat send ─────────────────────────────────────────────── */
    // Patterns the user might type meaning "run it"
    const RUN_INTENT = /^(run|start|open|launch|execute|go|play|show)\b/i;

    // Patterns that mean "generate / build something" — route to generate flow
    const GENERATE_INTENT = /^(create|build|generate|make|write|develop|add|implement|code)\b/i;

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || isLoading || accepting) return;

        // ── Run-intent shortcut ──────────────────────────────────
        if (RUN_INTENT.test(text)) {
            const textLower = text.toLowerCase();
            const textWords = textLower.split(/\s+/);

            // Detect generic "run it" vs named "run portfolio"
            const GENERIC_RUN = /^(run|start|open|launch|execute|go|play|show)\s*(it|this|that|the\s+app|now)?\s*$/i;
            const isGeneric = GENERIC_RUN.test(text.trim());

            const RUN_STOP = new Set([
                'run','start','open','launch','execute','go','play','show',
                'the','a','an','it','this','that','my','please','now',
                'app','application','website','site','page','file','html','project','code',
            ]);

            // 1. Named match from in-session history
            const matched = projectHistory.slice().reverse().find(p =>
                p.keywords.some(kw => textWords.some(tw => tw.includes(kw) || kw.includes(tw)))
            );

            let cmdToRun = null;

            if (matched) {
                cmdToRun = matched.cmd;
            } else if (isGeneric) {
                // "run it" with no name → use the most recently created app
                cmdToRun = runCommand;
            } else if (terminalCwd) {
                // Specific name not in history → derive from keyword + CWD
                // Do NOT fall back to runCommand — that would open the wrong app
                const rawKeyword = textWords.find(w => w.length > 2 && !RUN_STOP.has(w));
                if (rawKeyword) {
                    const keyword  = rawKeyword.replace(/[*?[\]|<>:"]/g, '').trim();
                    const cleanCwd = terminalCwd.replace(/[*?[\]]/g, '').trim().replace(/[/\\]+$/, '');
                    if (keyword && cleanCwd) {
                        const sep = cleanCwd.includes('\\') ? '\\' : '/';
                        cmdToRun = `start "" "${[cleanCwd, `${keyword}.html`].join(sep)}"`;
                    }
                }
            }

            if (cmdToRun) {
                setInput('');
                await sendMessage(text, { role: 'user', skipAI: true });
                await handleRun(cmdToRun);
                textareaRef.current?.focus();
                return;
            }

            // Nothing → helpful hint instead of falling through to AI chat
            setInput('');
            await sendMessage(text, { role: 'user', skipAI: true });
            sendMessage(
                "I'm not sure what to run. Try **\"run portfolio\"** or **\"run counter\"** — I'll look for that `.html` file in your current terminal directory.",
                { role: 'assistant', skipAI: true }
            );
            textareaRef.current?.focus();
            return;
        }

        // ── Auto-route to generate flow for creation requests ────
        const wantsGenerate = mode === 'generate' || GENERATE_INTENT.test(text);

        if (wantsGenerate) {
            await handleGenerate();
        } else {
            setInput('');
            await sendMessage(text);
        }
        textareaRef.current?.focus();
    }, [input, mode, isLoading, accepting, runCommand, projectHistory, handleGenerate, handleRun, sendMessage]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="chat">
            <div className="panel-header">
                <span>AI Assistant</span>
                <div className="panel-header__actions">
                    <button className="icon-btn" title="Clear chat" onClick={clearChat}>
                        <VscClearAll size={14} />
                    </button>
                </div>
            </div>

            {/* ── Messages ──────────────────────────────────── */}
            <div className="chat__messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-msg chat-msg--${msg.role} ${msg.isError ? 'chat-msg--error' : ''}`}>
                        <div className="chat-msg__bubble">{msg.content}</div>
                        <span className="chat-msg__time">{formatTime(msg.timestamp)}</span>
                    </div>
                ))}

                {/* ── Generation progress ──────────────────── */}
                {isLoading && (
                    <div className="chat__loading">
                        <div className="chat__loading-dots"><span /><span /><span /></div>
                        <div className="chat__loading-text">
                            {generationProgress ? (
                                <div className="chat__progress-container">
                                    <span className="chat__progress-phase">
                                        {generationProgress.phase === 'planning'   && '📋 Planning'}
                                        {generationProgress.phase === 'generating' && '⚡ Generating'}
                                        {generationProgress.phase === 'assembling' && '📦 Writing files'}
                                    </span>
                                    <span className="chat__progress-msg">{generationProgress.message}</span>
                                </div>
                            ) : (
                                <span>AI is thinking…</span>
                            )}
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* ── Preview card (sticky above input, always fully visible) ── */}
            {pendingPlan && !isLoading && (
                <div className="chat-preview">
                    <div className="chat-preview__header">
                        <span className="chat-preview__title">{pendingPlan.explanation}</span>
                        {stackBadge(pendingPlan.stack)}
                    </div>

                    <div className="chat-preview__files">
                        {(pendingPlan.files || []).map(f => (
                            <div key={f.path} className="chat-preview__file">
                                <span className="chat-preview__file-icon">{fileIcon(f.path)}</span>
                                <div className="chat-preview__file-info">
                                    <span className="chat-preview__file-path">{f.path}</span>
                                    {f.description && (
                                        <span className="chat-preview__file-desc">{f.description}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="chat-preview__cwd">
                        <VscFolder size={11} />
                        <span>Creates in: <code>{terminalCwd || 'projects/'}</code></span>
                    </div>

                    {pendingPlan.runCommand && (
                        <div className="chat-preview__runcmd">
                            <VscTerminal size={10} />
                            <span>Run with: </span>
                            <code>{pendingPlan.runCommand}</code>
                        </div>
                    )}
                    <div className="chat-preview__actions">
                        <button
                            className="chat-preview__btn chat-preview__btn--accept"
                            onClick={handleAccept}
                            disabled={accepting}
                        >
                            <VscCheck size={13} />
                            {accepting ? 'Generating…' : 'Accept & Create'}
                        </button>
                        <button
                            className="chat-preview__btn chat-preview__btn--reject"
                            onClick={handleReject}
                            disabled={accepting}
                        >
                            <VscClose size={13} /> Reject
                        </button>
                    </div>
                </div>
            )}

            {/* ── Run command bar (sticky above input) ── */}
            {runCommand && !pendingPlan && !isLoading && (
                <div className="chat-run-bar">
                    <VscTerminal size={13} />
                    <code className="chat-run-bar__cmd">{runCommand}</code>
                    <button
                        className="chat-run-bar__btn"
                        onClick={() => handleRun(runCommand)}
                    >
                        ▶ Run
                    </button>
                    <button
                        className="chat-run-bar__dismiss"
                        onClick={() => setRunCommand('')}
                        title="Dismiss"
                    >
                        <VscClose size={11} />
                    </button>
                </div>
            )}

            {/* ── Input area ────────────────────────────────── */}
            <div className="chat__input-area">
                <div className="chat__mode-toggle">
                    <button
                        className={`chat__mode-btn ${mode === 'chat' ? 'chat__mode-btn--active' : ''}`}
                        onClick={() => setMode('chat')}
                    >
                        <VscComment size={12} /> Chat
                    </button>
                    <button
                        className={`chat__mode-btn ${mode === 'generate' ? 'chat__mode-btn--active' : ''}`}
                        onClick={() => setMode('generate')}
                    >
                        <VscWand size={12} /> Generate
                    </button>
                </div>
                <div className="chat__input-row">
                    <textarea
                        ref={textareaRef}
                        className="chat__textarea"
                        placeholder={
                            mode === 'generate'
                                ? 'Say "create a counter", "build a todo app"… files go in your terminal\'s directory'
                                : 'Ask anything — or say "create …" to generate files in your current directory'
                        }
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                    />
                    <button
                        className="chat__send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading || accepting}
                        title="Send"
                    >
                        <VscSend size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
