import { Router } from 'express';
import {
    getFileTree,
    getFileContent,
    createFile,
    updateFile,
    deleteFile,
    createFolder,
    renameItem,
    setWorkingDir,
    getWorkingDir,
    getAllFiles,
    resetToNewSession,
} from '../services/fileManager.js';

/**
 * Factory — creates file routes with access to Socket.IO
 */
export default function createFileRoutes(io) {
    const router = Router();

    /** Broadcast a file-change event to all connected clients */
    function emitChange(action, filePath, extra = {}) {
        io.emit('files:changed', { action, path: filePath, ...extra });
    }

    // ── Start a fresh session (empty project) ────────────
    router.post('/new-session', (_req, res) => {
        try {
            const workingDir = resetToNewSession();
            const tree = getFileTree();
            emitChange('new-session', workingDir);
            io.emit('terminal:chdir', { dir: workingDir });
            res.json({ success: true, workingDir, tree });
        } catch (error) {
            console.error('New Session Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Open a folder from disk (path-based) ─────────────
    router.post('/open-folder', (req, res) => {
        try {
            const { folderPath } = req.body;
            if (!folderPath) {
                return res.status(400).json({ error: 'Folder path is required' });
            }

            setWorkingDir(folderPath);
            const tree = getFileTree();
            const wd = getWorkingDir();
            emitChange('open-folder', folderPath);
            io.emit('terminal:chdir', { dir: wd });
            res.json({ success: true, workingDir: wd, tree });
        } catch (error) {
            console.error('Open Folder Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Import folder from browser (File System Access API) ──
    // Receives { folderName, files: { 'relative/path': 'content' } }
    // Writes them into projects/<folderName>/ and sets working dir
    router.post('/import-folder', async (req, res) => {
        try {
            const { folderName, files } = req.body;
            if (!folderName || !files || typeof files !== 'object') {
                return res.status(400).json({ error: 'folderName and files are required' });
            }

            const { importFolder } = await import('../services/fileManager.js');
            const workingDir = importFolder(folderName, files);
            const tree = getFileTree();
            emitChange('open-folder', workingDir);
            res.json({ success: true, workingDir, tree });
        } catch (error) {
            console.error('Import Folder Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Get current project info ──────────────────────────
    router.get('/project-info', (_req, res) => {
        try {
            res.json({ workingDir: getWorkingDir() });
        } catch (error) {
            console.error('Project Info Error:', error);
            res.status(500).json({ error: 'Failed to get project info' });
        }
    });

    // ── Get full file tree ─────────────────────────────────
    router.get('/tree', (_req, res) => {
        try {
            const tree = getFileTree();
            res.json(tree);
        } catch (error) {
            console.error('File Tree Error:', error);
            res.status(500).json({ error: 'Failed to get file tree' });
        }
    });

    // ── Get all files as a flat object ──────────────────────
    router.get('/all', (_req, res) => {
        try {
            const files = getAllFiles();
            res.json(files);
        } catch (error) {
            console.error('Get All Files Error:', error);
            res.status(500).json({ error: 'Failed to get all files' });
        }
    });

    // ── Get single file content ───────────────────────────
    router.get('/content', (req, res) => {
        try {
            const { path } = req.query;
            if (!path) {
                return res.status(400).json({ error: 'File path is required' });
            }

            const content = getFileContent(path);
            if (content === null) {
                return res.status(404).json({ error: 'File not found' });
            }

            res.json({ path, content });
        } catch (error) {
            console.error('File Content Error:', error);
            res.status(500).json({ error: 'Failed to get file content' });
        }
    });

    // ── Create file ────────────────────────────────────────
    router.post('/create', (req, res) => {
        try {
            const { path, content = '' } = req.body;
            if (!path) {
                return res.status(400).json({ error: 'File path is required' });
            }

            createFile(path, content);
            emitChange('create', path);
            res.json({ success: true, path });
        } catch (error) {
            console.error('File Create Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Update file ────────────────────────────────────────
    router.put('/update', (req, res) => {
        try {
            const { path, content } = req.body;
            if (!path) {
                return res.status(400).json({ error: 'File path is required' });
            }

            updateFile(path, content);
            emitChange('update', path);
            res.json({ success: true, path });
        } catch (error) {
            console.error('File Update Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Delete file / folder ──────────────────────────────
    router.delete('/delete', (req, res) => {
        try {
            const { path } = req.body;
            if (!path) {
                return res.status(400).json({ error: 'Path is required' });
            }

            deleteFile(path);
            emitChange('delete', path);
            res.json({ success: true, path });
        } catch (error) {
            console.error('File Delete Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Create folder ──────────────────────────────────────
    router.post('/folder', (req, res) => {
        try {
            const { path } = req.body;
            if (!path) {
                return res.status(400).json({ error: 'Folder path is required' });
            }

            createFolder(path);
            emitChange('create-folder', path);
            res.json({ success: true, path });
        } catch (error) {
            console.error('Folder Create Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ── Rename file / folder ──────────────────────────────
    router.put('/rename', (req, res) => {
        try {
            const { oldPath, newPath } = req.body;
            if (!oldPath || !newPath) {
                return res.status(400).json({ error: 'Both old and new paths are required' });
            }

            renameItem(oldPath, newPath);
            emitChange('rename', newPath, { oldPath });
            res.json({ success: true, oldPath, newPath });
        } catch (error) {
            console.error('Rename Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
