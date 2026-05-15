import axios from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:3001/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
});

// Add a request interceptor to include the Auth token
API.interceptors.request.use((config) => {
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user.token) {
                config.headers.Authorization = `Bearer ${user.token}`;
            }
        } catch (e) {
            // ignore
        }
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

/* ── File operations ──────────────────────────────────── */

export const fetchFileTree = () =>
    API.get('/files/tree').then((r) => r.data);

export const fetchFileContent = (path) =>
    API.get('/files/content', { params: { path } }).then((r) => r.data.content);

export const createFileAPI = (path, content = '') =>
    API.post('/files/create', { path, content }).then((r) => r.data);

export const updateFileAPI = (path, content) =>
    API.put('/files/update', { path, content }).then((r) => r.data);

export const deleteFileAPI = (path) =>
    API.delete('/files/delete', { data: { path } }).then((r) => r.data);

export const createFolderAPI = (path) =>
    API.post('/files/folder', { path }).then((r) => r.data);

export const renameItemAPI = (oldPath, newPath) =>
    API.put('/files/rename', { oldPath, newPath }).then((r) => r.data);

export const openFolderAPI = (folderPath) =>
    API.post('/files/open-folder', { folderPath }).then((r) => r.data);

export const importFolderAPI = (folderName, files) =>
    API.post('/files/import-folder', { folderName, files }, { timeout: 60000 }).then((r) => r.data);

export const fetchProjectInfo = () =>
    API.get('/files/project-info').then((r) => r.data);

export const newSessionAPI = () =>
    API.post('/files/new-session').then((r) => r.data);

export const fetchAllFiles = () =>
    API.get('/files/all').then((r) => r.data);

/* ── AI operations ────────────────────────────────────── */

const AI_TIMEOUT = 300_000;

export const chatWithAI = (message, context = {}) =>
    API.post('/ai/chat', { message, context }, { timeout: AI_TIMEOUT }).then((r) => r.data);

export const generateCode = (prompt, files = null) =>
    API.post('/ai/generate', { prompt, files }, { timeout: AI_TIMEOUT }).then((r) => r.data);

export const debugCode = (error, code, filename) =>
    API.post('/ai/debug', { error, code, filename }, { timeout: AI_TIMEOUT }).then((r) => r.data);

export const suggestCode = (prefix, suffix, language, filename) =>
    API.post('/ai/suggest', { prefix, suffix, language, filename }, { timeout: 10000 }).then((r) => r.data);

/** Phase 1 — get a plan (no files written yet) */
export const planGeneration = (prompt) =>
    API.post('/ai/plan', { prompt }, { timeout: AI_TIMEOUT }).then((r) => r.data);

/** Phase 2 — accept a plan: generate content and write to targetDir */
export const acceptPlan = (planId, targetDir) =>
    API.post('/ai/accept', { planId, targetDir }, { timeout: AI_TIMEOUT }).then((r) => r.data);

/** Ask the terminal to run a command automatically */
export const runInTerminal = (command, socketId) =>
    API.post('/ai/run-in-terminal', { command, socketId }).then((r) => r.data);

/** Open a file in the OS default app (server-side, bypasses PTY GUI limitations) */
export const openFileAPI = (filePath) =>
    API.post('/ai/open-file', { filePath }).then((r) => r.data);


/* ── Preview ──────────────────────────────────────────── */

export const fetchPreviewBundle = () =>
    API.get('/preview/bundle').then((r) => r.data);

export default API;
