import { useCallback, useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { VscCode } from 'react-icons/vsc';
import { useFiles } from '../../context/FileContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useInlineSuggestion } from '../../context/InlineSuggestionContext.jsx';
import { suggestCode } from '../../services/api.js';
import './Editor.css';

/* ── Language detection from file extension ──────────── */
function getLanguage(filename) {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop()?.toLowerCase();
    const map = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        json: 'json',
        css: 'css',
        scss: 'scss',
        html: 'html',
        htm: 'html',
        md: 'markdown',
        py: 'python',
        rb: 'ruby',
        java: 'java',
        go: 'go',
        rs: 'rust',
        sh: 'shell',
        bash: 'shell',
        yml: 'yaml',
        yaml: 'yaml',
        xml: 'xml',
        sql: 'sql',
        env: 'ini',
        gitignore: 'plaintext',
    };
    return map[ext] || 'plaintext';
}

export default function Editor() {
    const { activeFile, fileContents, updateContent, loading } = useFiles();
    const { isDark } = useTheme();
    const { enabled: inlineSuggestionsEnabled } = useInlineSuggestion();

    const debounceTimer = useRef(null);
    const activeFileRef = useRef(activeFile);
    const providerRef = useRef(null);
    const monacoRef = useRef(null);  // store monaco instance for re-registration

    useEffect(() => {
        activeFileRef.current = activeFile;
    }, [activeFile]);

    /* ── Register / dispose inline completion provider ── */
    const registerProvider = useCallback((monaco) => {
        if (providerRef.current) {
            providerRef.current.dispose();
            providerRef.current = null;
        }
        if (!monaco) return;

        providerRef.current = monaco.languages.registerInlineCompletionsProvider('*', {
            provideInlineCompletions: async (model, position, context, token) => {
                const text = model.getValue();
                const offset = model.getOffsetAt(position);
                const prefix = text.substring(0, offset);
                const suffix = text.substring(offset);
                const language = model.getLanguageId();
                const filename = activeFileRef.current || 'unknown';

                try {
                    const data = await suggestCode(prefix, suffix, language, filename);
                    if (data?.suggestion) {
                        return {
                            items: [{
                                insertText: data.suggestion,
                                range: new monaco.Range(
                                    position.lineNumber, position.column,
                                    position.lineNumber, position.column
                                )
                            }]
                        };
                    }
                } catch (e) {
                    console.error('Inline suggestion error:', e);
                }
                return { items: [] };
            },
            freeInlineCompletions: () => {}
        });
    }, []);

    /* ── Re-register whenever enabled state changes ───── */
    useEffect(() => {
        if (!monacoRef.current) return;

        if (inlineSuggestionsEnabled) {
            registerProvider(monacoRef.current);
        } else {
            // Dispose and clear when user turns it off
            if (providerRef.current) {
                providerRef.current.dispose();
                providerRef.current = null;
            }
        }
    }, [inlineSuggestionsEnabled, registerProvider]);

    /* ── Cleanup on unmount ──────────────────────────── */
    useEffect(() => {
        return () => {
            if (providerRef.current) {
                providerRef.current.dispose();
                providerRef.current = null;
            }
        };
    }, []);

    const handleEditorDidMount = useCallback((editor, monaco) => {
        monacoRef.current = monaco;
        if (inlineSuggestionsEnabled) {
            registerProvider(monaco);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const content = activeFile ? (fileContents[activeFile] ?? '') : '';
    const language = activeFile ? getLanguage(activeFile) : 'plaintext';

    const handleChange = useCallback((value) => {
        if (!activeFile) return;
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            updateContent(activeFile, value || '');
        }, 300);
    }, [activeFile, updateContent]);

    /* ── Empty state ─────────────────────────────────── */
    if (!activeFile) {
        return (
            <div className="editor-container">
                <div className="editor-empty">
                    <VscCode className="editor-empty__icon" />
                    <div className="editor-empty__title">Codex</div>
                    <div className="editor-empty__hint">
                        Open a file from the explorer, or use the AI chat to generate a new project.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="editor-container">
            {loading ? (
                <div className="editor-empty">
                    <div className="editor-empty__hint">Loading file...</div>
                </div>
            ) : (
                <MonacoEditor
                    height="100%"
                    theme={isDark ? 'vs-dark' : 'vs'}
                    language={language}
                    value={content}
                    onChange={handleChange}
                    onMount={handleEditorDidMount}
                    options={{
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        minimap: { enabled: true, scale: 1 },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                        renderWhitespace: 'selection',
                        bracketPairColorization: { enabled: true },
                        autoIndent: 'full',
                        formatOnPaste: true,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        padding: { top: 12 },
                        // Inline suggestions respect the enabled toggle
                        inlineSuggest: { enabled: inlineSuggestionsEnabled },
                    }}
                />
            )}
        </div>
    );
}
