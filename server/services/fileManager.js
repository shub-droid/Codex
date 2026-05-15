/**
 * Local file system manager.
 * Reads and writes files to a real directory on disk.
 */

import fs from 'fs';
import path from 'path';

// ── Working directory ──────────────────────────────────
const DEFAULT_DIR = path.resolve('projects');
const WORKINGDIR_FILE = path.resolve('.workingdir'); // persists across restarts

// Load persisted working dir if it exists and is valid
function loadPersistedWorkingDir() {
    try {
        if (fs.existsSync(WORKINGDIR_FILE)) {
            const saved = fs.readFileSync(WORKINGDIR_FILE, 'utf-8').trim();
            if (saved && fs.existsSync(saved) && fs.statSync(saved).isDirectory()) {
                return saved;
            }
        }
    } catch { /* ignore */ }
    return DEFAULT_DIR;
}

let workingDir = loadPersistedWorkingDir();

// Directories/files to skip when scanning
const SKIP_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build',
    '.cache', '.vscode', '.idea', '__pycache__', '.DS_Store',
]);

// ── Helpers ────────────────────────────────────────────
function normalizePath(p) {
    return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function toAbsolute(relativePath) {
    const normalized = normalizePath(relativePath);
    const absolute = path.resolve(workingDir, normalized);

    // Security: prevent path traversal outside workingDir
    if (!absolute.startsWith(path.resolve(workingDir))) {
        throw new Error('Access denied: path is outside the project directory');
    }

    return absolute;
}

// ── Working Dir Management ─────────────────────────────

/**
 * Reset to a fresh, empty project directory for a new session.
 * Creates a new folder under projects/ and sets it as the working dir.
 */
export function resetToNewSession() {
    const sessionId = `project_${Date.now()}`;
    const sessionDir = path.resolve('projects', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    workingDir = sessionDir;
    try { fs.writeFileSync(WORKINGDIR_FILE, workingDir, 'utf-8'); } catch { /* ignore */ }
    console.log(`🆕 New session started: ${workingDir}`);
    return workingDir;
}

/**
 * Set the working directory to an absolute path on disk.
 */
export function setWorkingDir(absolutePath) {
    const resolved = path.resolve(absolutePath);

    if (!fs.existsSync(resolved)) {
        throw new Error(`Directory does not exist: ${resolved}`);
    }

    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error(`Path is not a directory: ${resolved}`);
    }

    workingDir = resolved;
    // Persist so server restarts (nodemon) don't reset it
    try { fs.writeFileSync(WORKINGDIR_FILE, workingDir, 'utf-8'); } catch { /* ignore */ }
    console.log(`📂 Working directory set to: ${workingDir}`);
}

/**
 * Get the current working directory.
 */
export function getWorkingDir() {
    return workingDir;
}

// ── Public API ─────────────────────────────────────────

/**
 * Get file tree as nested array by scanning disk.
 */
export function getFileTree(dirPath = workingDir) {
    // Ensure the directory exists
    if (!fs.existsSync(dirPath)) {
        if (dirPath === workingDir) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Skip hidden files/folders (starting with .)
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(workingDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            tree.push({
                name: entry.name,
                type: 'folder',
                path: relativePath,
                children: getFileTree(fullPath),
            });
        } else {
            tree.push({
                name: entry.name,
                type: 'file',
                path: relativePath,
            });
        }
    }

    // Sort: folders first, then files, alphabetical
    tree.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return tree;
}

/**
 * Get content of a single file, returns null if not found.
 */
export function getFileContent(filePath) {
    const absolute = toAbsolute(filePath);

    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
        return null;
    }

    return fs.readFileSync(absolute, 'utf-8');
}

/**
 * Create a new file
 */
export function createFile(filePath, content = '') {
    const absolute = toAbsolute(filePath);

    if (fs.existsSync(absolute)) {
        throw new Error(`File already exists: ${filePath}`);
    }

    // Auto-create parent directories
    const dir = path.dirname(absolute);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(absolute, content, 'utf-8');
}

/**
 * Update an existing file's content
 */
export function updateFile(filePath, content) {
    const absolute = toAbsolute(filePath);

    if (!fs.existsSync(absolute)) {
        // If file doesn't exist, create it (useful for AI-generated files)
        const dir = path.dirname(absolute);
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(absolute, content, 'utf-8');
}

/**
 * Delete a file or folder (and all children)
 */
export function deleteFile(filePath) {
    const absolute = toAbsolute(filePath);

    if (!fs.existsSync(absolute)) {
        throw new Error(`Path not found: ${filePath}`);
    }

    fs.rmSync(absolute, { recursive: true, force: true });
}

/**
 * Create a folder (and parent folders as needed)
 */
export function createFolder(folderPath) {
    const absolute = toAbsolute(folderPath);
    fs.mkdirSync(absolute, { recursive: true });
}

/**
 * Rename a file or folder
 */
export function renameItem(oldPath, newPath) {
    const absoluteOld = toAbsolute(oldPath);
    const absoluteNew = toAbsolute(newPath);

    if (!fs.existsSync(absoluteOld)) {
        throw new Error(`Path not found: ${oldPath}`);
    }

    // Auto-create parent directory for new path
    const dir = path.dirname(absoluteNew);
    fs.mkdirSync(dir, { recursive: true });

    fs.renameSync(absoluteOld, absoluteNew);
}

/**
 * Get all files as a flat object { path: content }
 */
export function getAllFiles(dirPath = workingDir) {
    const result = {};

    if (!fs.existsSync(dirPath)) return result;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(workingDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            Object.assign(result, getAllFiles(fullPath));
        } else {
            try {
                result[relativePath] = fs.readFileSync(fullPath, 'utf-8');
            } catch {
                // Skip binary or unreadable files
            }
        }
    }

    return result;
}

/**
 * Import a folder from the browser (File System Access API).
 * Receives a flat { 'relative/path': 'content' } map,
 * writes all files into projects/<folderName>/ on disk,
 * and sets that as the new working directory.
 *
 * @param {string} folderName - Name of the root folder selected by user
 * @param {Object} files - Flat map of relative path -> file content (string)
 * @returns {string} The absolute path of the new working directory
 */
export function importFolder(folderName, files) {
    // Sanitize folder name - remove unsafe chars
    const safeName = folderName.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'imported-project';
    const projectPath = path.resolve('projects', safeName);

    // Clean and recreate the project directory
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.mkdirSync(projectPath, { recursive: true });

    // Write all files
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(projectPath, relativePath.replace(/\//g, path.sep));
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
    }

    // Set as working directory + persist across restarts
    workingDir = projectPath;
    try { fs.writeFileSync(WORKINGDIR_FILE, workingDir, 'utf-8'); } catch { /* ignore */ }
    console.log(`📂 Imported folder "${safeName}" → ${projectPath} (${Object.keys(files).length} files)`);

    return projectPath;
}

