import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { chatWithAI, generateCode } from '../services/api.js';
import socket from '../services/socket.js';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: '👋 Hi! I\'m your Codex AI assistant. Describe what you want to build and I\'ll generate the code for you.\n\nYou can also paste errors here and I\'ll help you debug them.',
            timestamp: Date.now(),
        },
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(null);
    const [logs, setLogs] = useState([]);   // terminal-style log entries
    const bottomRef = useRef(null);

    /* ── Listen for socket events ───────────────────────── */
    useEffect(() => {
        const handleProgress = (data) => {
            setGenerationProgress(data);
        };
        socket.on('generation:progress', handleProgress);
        return () => {
            socket.off('generation:progress', handleProgress);
        };
    }, []);

    /* ── Auto-scroll on new message ─────────────────────── */
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /* ── Add a log entry (for Terminal panel) ───────────── */
    const addLog = useCallback((text, type = 'info') => {
        setLogs((prev) => [
            ...prev,
            { text, type, timestamp: Date.now() },
        ]);
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    /* ── Stable ref lock — avoids isLoading closure-staleness bug ── */
    const chatLockRef  = useRef(false);
    const chatTimerRef = useRef(null);

    /* ── Send a chat message ────────────────────────────── */
    const sendMessage = useCallback(async (content, opts = {}) => {
        const { skipAI = false, role = 'user' } = opts;

        if (skipAI) {
            // Just push a message without calling the AI
            setMessages((prev) => [...prev, { role, content, timestamp: Date.now() }]);
            return;
        }

        if (!content.trim() || chatLockRef.current) return;

        chatLockRef.current = true;
        setIsLoading(true);

        // Safety valve: if Groq API hangs and never resolves, unlock after 30 s
        chatTimerRef.current = setTimeout(() => {
            chatLockRef.current = false;
            setIsLoading(false);
        }, 30_000);

        const userMsg = { role: 'user', content, timestamp: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        addLog(`💬 User: ${content.slice(0, 80)}...`, 'info');

        try {
            const response = await chatWithAI(content);
            const aiMsg = {
                role: 'assistant',
                content: response.message,
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, aiMsg]);
            addLog('✅ AI responded', 'success');
        } catch (err) {
            const errMsg = {
                role: 'assistant',
                content: `❌ Error: ${err.response?.data?.error || err.message}`,
                timestamp: Date.now(),
                isError: true,
            };
            setMessages((prev) => [...prev, errMsg]);
            addLog(`❌ AI error: ${err.message}`, 'error');
        } finally {
            clearTimeout(chatTimerRef.current);
            chatLockRef.current = false;
            setIsLoading(false);
        }
    }, [addLog]);   // isLoading intentionally removed — chatLockRef is the guard now


    /* ── Send a code generation request ─────────────────── */
    const sendGenerateRequest = useCallback(async (prompt, currentFiles = null) => {
        if (!prompt.trim() || isLoading) return null;

        const userMsg = { role: 'user', content: `🔧 Generate: ${prompt}`, timestamp: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
        setGenerationProgress(null);
        addLog(`🔧 Generating code: ${prompt.slice(0, 80)}...`, 'info');

        try {
            const result = await generateCode(prompt, currentFiles);

            if (result.files) {
                const aiMsg = {
                    role: 'assistant',
                    content: `✅ ${result.explanation || 'Code generated!'}\n\n**Files affected:**\n${result.files.map((f) => `- \`${f.path}\` (${f.action}${f.success ? '' : ' ❌ FAILED'})`).join('\n')}`,
                    timestamp: Date.now(),
                    generatedFiles: result.files,
                };
                setMessages((prev) => [...prev, aiMsg]);

                result.files.forEach((f) => {
                    addLog(`  ${f.success ? '✅' : '❌'} ${f.action}: ${f.path}`, f.success ? 'success' : 'error');
                });

                return result;
            } else {
                const aiMsg = {
                    role: 'assistant',
                    content: result.message,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, aiMsg]);
                addLog('✅ AI responded (text)', 'success');
                return result;
            }
        } catch (err) {
            const errMsg = {
                role: 'assistant',
                content: `❌ Generation failed: ${err.response?.data?.error || err.message}`,
                timestamp: Date.now(),
                isError: true,
            };
            setMessages((prev) => [...prev, errMsg]);
            addLog(`❌ Generation error: ${err.message}`, 'error');
            return null;
        } finally {
            setIsLoading(false);
            setGenerationProgress(null);
        }
    }, [isLoading, addLog]);

    /* ── Clear chat history ─────────────────────────────── */
    const clearChat = useCallback(() => {
        setMessages([{
            role: 'assistant',
            content: '🧹 Chat cleared. How can I help you?',
            timestamp: Date.now(),
        }]);
    }, []);

    const value = {
        messages,
        isLoading,
        setIsLoading,
        logs,
        bottomRef,
        sendMessage,
        sendGenerateRequest,
        clearChat,
        addLog,
        clearLogs,
        generationProgress,
        setGenerationProgress,
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error('useChat must be used within a ChatProvider');
    return ctx;
}

export default ChatContext;
