import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
    fetchFileTree,
    fetchFileContent,
    createFileAPI,
    updateFileAPI,
    deleteFileAPI,
    createFolderAPI,
    renameItemAPI,
    openFolderAPI,
    fetchProjectInfo,
} from '../services/api.js';
import socket from '../services/socket.js';

const FileContext = createContext(null);

export function FileProvider({ children }) {
    const [fileTree, setFileTree] = useState([]);
    const [openFiles, setOpenFiles] = useState([]);         // array of paths
    const [activeFile, setActiveFile] = useState(null);      // path string
    const [fileContents, setFileContents] = useState({});    // { path: content }
    const [modifiedFiles, setModifiedFiles] = useState(new Set()); // unsaved
    const [loading, setLoading] = useState(false);
    const [projectRoot, setProjectRoot] = useState('');

    /* ── Load file tree on mount ────────────────────────── */
    const refreshTree = useCallback(async () => {
        try {
            const tree = await fetchFileTree();
            setFileTree(tree);
        } catch (err) {
            console.error('Failed to fetch file tree:', err);
        }
    }, []);

    useEffect(() => {
        // Fetch project info + tree on mount
        fetchProjectInfo()
            .then((info) => setProjectRoot(info.workingDir || ''))
            .catch(() => { });
        refreshTree();
    }, [refreshTree]);

    /* ── Auto-sync tree on Socket.IO file changes ──────── */
    useEffect(() => {
        function handleFilesChanged() {
            refreshTree();
        }

        function handleChdir({ dir } = {}) {
            if (dir) setProjectRoot(dir);
            refreshTree();
        }

        socket.on('files:changed', handleFilesChanged);
        socket.on('terminal:chdir', handleChdir);
        return () => {
            socket.off('files:changed', handleFilesChanged);
            socket.off('terminal:chdir', handleChdir);
        };
    }, [refreshTree]);

    /* ── Open a file ────────────────────────────────────── */
    const openFile = useCallback(async (path) => {
        setActiveFile(path);

        if (!openFiles.includes(path)) {
            setOpenFiles((prev) => [...prev, path]);
        }

        // Fetch content if not cached
        if (!(path in fileContents)) {
            try {
                setLoading(true);
                const content = await fetchFileContent(path);
                setFileContents((prev) => ({ ...prev, [path]: content }));
            } catch (err) {
                console.error('Failed to fetch file content:', err);
                setFileContents((prev) => ({ ...prev, [path]: `// Error loading file: ${err.message}` }));
            } finally {
                setLoading(false);
            }
        }
    }, [openFiles, fileContents]);

    /* ── Close a file tab ───────────────────────────────── */
    const closeFile = useCallback((path) => {
        setOpenFiles((prev) => {
            const updated = prev.filter((p) => p !== path);

            // If closing the active file, switch to the last remaining tab
            if (activeFile === path) {
                const newActive = updated.length > 0 ? updated[updated.length - 1] : null;
                setActiveFile(newActive);
            }

            return updated;
        });

        // Remove from modified set
        setModifiedFiles((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
        });
    }, [activeFile]);

    /* ── Update file content locally (on editor change) ── */
    const updateContent = useCallback((path, content) => {
        setFileContents((prev) => ({ ...prev, [path]: content }));
        setModifiedFiles((prev) => new Set(prev).add(path));
    }, []);

    /* ── Save file to server ────────────────────────────── */
    const saveFile = useCallback(async (path) => {
        const content = fileContents[path];
        if (content === undefined) return;

        try {
            await updateFileAPI(path, content);
            setModifiedFiles((prev) => {
                const next = new Set(prev);
                next.delete(path);
                return next;
            });
        } catch (err) {
            console.error('Failed to save file:', err);
        }
    }, [fileContents]);

    /* ── Create new file ────────────────────────────────── */
    const createNewFile = useCallback(async (path, content = '') => {
        try {
            await createFileAPI(path, content);
            await refreshTree();
            await openFile(path);
        } catch (err) {
            console.error('Failed to create file:', err);
        }
    }, [refreshTree, openFile]);

    /* ── Create new folder ──────────────────────────────── */
    const createNewFolder = useCallback(async (path) => {
        try {
            await createFolderAPI(path);
            await refreshTree();
        } catch (err) {
            console.error('Failed to create folder:', err);
        }
    }, [refreshTree]);

    /* ── Delete a file or folder ────────────────────────── */
    const deleteItem = useCallback(async (path) => {
        try {
            await deleteFileAPI(path);
            // Close tab if open
            if (openFiles.includes(path)) {
                closeFile(path);
            }
            await refreshTree();
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    }, [openFiles, closeFile, refreshTree]);

    /* ── Rename ─────────────────────────────────────────── */
    const renameItem = useCallback(async (oldPath, newPath) => {
        try {
            await renameItemAPI(oldPath, newPath);
            // Update open tabs
            setOpenFiles((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
            if (activeFile === oldPath) setActiveFile(newPath);
            // Move cached content
            setFileContents((prev) => {
                const next = { ...prev };
                if (oldPath in next) {
                    next[newPath] = next[oldPath];
                    delete next[oldPath];
                }
                return next;
            });
            await refreshTree();
        } catch (err) {
            console.error('Failed to rename:', err);
        }
    }, [activeFile, refreshTree]);

    /* ── Open a folder from disk (path-based) ────────── */
    const openFolder = useCallback(async (folderPath) => {
        try {
            setLoading(true);
            const result = await openFolderAPI(folderPath);
            setProjectRoot(result.workingDir || folderPath);
            setFileTree(result.tree || []);
            // Clear editor state for new project
            setOpenFiles([]);
            setActiveFile(null);
            setFileContents({});
            setModifiedFiles(new Set());
        } catch (err) {
            console.error('Failed to open folder:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    /* ── Import folder from browser (File System Access API) */
    // Removed because we now use openFolder with absolute paths directly

    /* ── Apply files from AI generation ─────────────────── */
    const applyGeneratedFiles = useCallback(async (files) => {
        for (const file of files) {
            if (file.success) {
                // Refresh cached content if this file was open
                if (openFiles.includes(file.path)) {
                    try {
                        const content = await fetchFileContent(file.path);
                        setFileContents((prev) => ({ ...prev, [file.path]: content }));
                    } catch {
                        // ignore
                    }
                }
            }
        }
        await refreshTree();
    }, [openFiles, refreshTree]);

    const value = {
        fileTree,
        openFiles,
        activeFile,
        fileContents,
        modifiedFiles,
        loading,
        projectRoot,
        setActiveFile,
        openFile,
        closeFile,
        updateContent,
        saveFile,
        createNewFile,
        createNewFolder,
        deleteItem,
        renameItem,
        refreshTree,
        openFolder,
        applyGeneratedFiles,
    };

    return (
        <FileContext.Provider value={value}>
            {children}
        </FileContext.Provider>
    );
}

export function useFiles() {
    const ctx = useContext(FileContext);
    if (!ctx) throw new Error('useFiles must be used within a FileProvider');
    return ctx;
}

export default FileContext;
