import { Router } from 'express';
import { chatWithAI }           from '../services/grok.js';
import { planRequest, generateFilesForPlan, processAgentRequest } from '../services/agent.js';
import { getInlineSuggestion }  from '../services/gemini.js';
import { getWorkingDir }        from '../services/fileManager.js';

/**
 * Factory — creates AI routes with access to Socket.IO
 */
export default function createAIRoutes(io) {
    const router = Router();

    // ── Chat (general Q&A / debug) ──────────────────────────────
    router.post('/chat', async (req, res) => {
        try {
            const { message, context } = req.body;
            if (!message) return res.status(400).json({ error: 'Message is required' });

            const response = await chatWithAI(message, context);
            res.json(response);
        } catch (err) {
            console.error('[AI] Chat error:', err);
            res.status(500).json({ error: 'Failed to get AI response' });
        }
    });

    // ── Phase 1: Plan (returns plan, does NOT write files) ──────
    router.post('/plan', async (req, res) => {
        try {
            const { prompt } = req.body;
            if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

            const plan = await planRequest(prompt, io);
            res.json(plan);
        } catch (err) {
            console.error('[AI] Plan error:', err);
            res.status(500).json({ error: 'Failed to generate plan' });
        }
    });

    // ── Phase 2: Accept plan (generate content + write files) ───
    router.post('/accept', async (req, res) => {
        try {
            const { planId, targetDir } = req.body;
            if (!planId) return res.status(400).json({ error: 'planId is required' });

            // Use the provided targetDir (terminal CWD) or fall back to server workingDir
            const dir = targetDir || getWorkingDir();
            const result = await generateFilesForPlan(planId, dir, io);

            // Notify all clients that files changed
            if (result.files?.some(f => f.success)) {
                io.emit('files:changed', { action: 'generate', paths: result.files.filter(f => f.success).map(f => f.path) });
            }

            res.json(result);
        } catch (err) {
            console.error('[AI] Accept error:', err);
            res.status(500).json({ error: err.message || 'Failed to generate files' });
        }
    });

    // ── Run command in terminal ─────────────────────────────────
    // Emits terminal:run to the client's socket so the PTY executes it
    router.post('/run-in-terminal', async (req, res) => {
        try {
            const { command, socketId } = req.body;
            if (!command) return res.status(400).json({ error: 'Command is required' });

            if (socketId) {
                io.to(socketId).emit('terminal:run', { command });
            } else {
                io.emit('terminal:run', { command });
            }

            res.json({ success: true, command });
        } catch (err) {
            console.error('[AI] Run-in-terminal error:', err);
            res.status(500).json({ error: 'Failed to run command' });
        }
    });

    // ── Open a file in the OS default app (bypasses PTY limitations) ───
    router.post('/open-file', async (req, res) => {
        try {
            const { filePath } = req.body;
            if (!filePath) return res.status(400).json({ error: 'filePath is required' });

            const { exec } = await import('child_process');
            // Use start "" on Windows — the server process has full GUI access
            const cmd = `start "" "${filePath.replace(/"/g, '\\"')}"`;
            exec(cmd, { shell: 'cmd.exe' }, (err) => {
                if (err) {
                    console.error('[open-file] exec error:', err.message);
                    return res.status(500).json({ error: err.message });
                }
            });
            // Respond immediately; the browser opens asynchronously
            res.json({ success: true, filePath });
        } catch (err) {
            console.error('[AI] open-file error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Legacy: generate (old flow, kept for compat) ────────────
    router.post('/generate', async (req, res) => {
        try {
            const { prompt, files } = req.body;
            if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

            const result = await processAgentRequest(prompt, files, io);

            if (result.files?.length) {
                io.emit('files:changed', {
                    action: 'generate',
                    paths: result.files.filter(f => f.success).map(f => f.path),
                });
            }

            res.json(result);
        } catch (err) {
            console.error('[AI] Generate error:', err);
            res.status(500).json({ error: 'Failed to generate code' });
        }
    });

    // ── Debug assistance ─────────────────────────────────────────
    router.post('/debug', async (req, res) => {
        try {
            const { error: errorMsg, code, filename } = req.body;
            if (!errorMsg) return res.status(400).json({ error: 'Error message is required' });

            const response = await chatWithAI(
                `Debug this error in ${filename || 'the code'}:\n\nError: ${errorMsg}\n\nCode:\n${code || 'Not provided'}`,
                { mode: 'debug' }
            );
            res.json(response);
        } catch (err) {
            console.error('[AI] Debug error:', err);
            res.status(500).json({ error: 'Failed to debug' });
        }
    });

    // ── Inline suggestions ───────────────────────────────────────
    router.post('/suggest', async (req, res) => {
        try {
            const { prefix, suffix, language, filename } = req.body;
            if (prefix === undefined || suffix === undefined) {
                return res.status(400).json({ error: 'Prefix and suffix are required' });
            }
            const suggestion = await getInlineSuggestion(prefix, suffix, language, filename);
            res.json({ suggestion });
        } catch (err) {
            console.error('[AI] Suggest error:', err);
            res.status(500).json({ error: 'Failed to get suggestion' });
        }
    });

    return router;
}
