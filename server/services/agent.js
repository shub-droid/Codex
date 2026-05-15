/**
 * agent.js — AI code generation agent
 *
 * Two modes:
 *  1. plan()              — Phase 1: analyse request, return file plan (no content)
 *  2. generateFilesForPlan() — Phase 2: generate content for a stored plan, write to disk
 *
 * Legacy processAgentRequest() is kept for the old /generate route.
 */

import fs   from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { planAndPreview, generateSingleFile, generateCode } from './grok.js';
import { getFileTree, getFileContent, createFile, updateFile, deleteFile, createFolder, getWorkingDir } from './fileManager.js';

// ── Plan cache (in-memory, 30-minute TTL) ─────────────────────────────────────
const planCache = new Map();

function cachePlan(plan) {
    const planId = randomUUID();
    planCache.set(planId, plan);
    setTimeout(() => planCache.delete(planId), 30 * 60 * 1000);
    return planId;
}

function getCachedPlan(planId) {
    return planCache.get(planId) || null;
}

// ── Content sanitisation ──────────────────────────────────────────────────────
const CODE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.mjs', '.cjs', '.vue', '.svelte'];

function sanitizeContent(content, filePath = '') {
    const isCode = CODE_EXTS.some(ext => filePath.endsWith(ext));
    if (!isCode) return content;
    return content
        .replace(/\u2018|\u2019/g, "'")
        .replace(/\u201C|\u201D/g, '"')
        .replace(/\u2032/g, "'")
        .replace(/\u2033/g, '"');
}

// ── Phase 1: Plan ─────────────────────────────────────────────────────────────

/**
 * Analyse a user request, return a plan (no files written).
 * Returns { planId, explanation, stack, files, runCommand }
 */
export async function planRequest(prompt, io = null) {
    if (io) io.emit('generation:progress', { phase: 'planning', message: 'Analysing request…' });

    const plan = await planAndPreview(prompt);

    // Store with the original prompt so Phase 2 can reference it
    const planWithPrompt = { ...plan, originalPrompt: prompt };
    const planId = cachePlan(planWithPrompt);

    if (io) io.emit('generation:progress', { phase: 'planning', message: 'Plan ready.' });

    return { planId, ...plan };
}

// ── Phase 2: Generate & write ─────────────────────────────────────────────────

/**
 * Accept a plan: generate file content and write to targetDir.
 * Returns { files: [{ path, success, error? }] }
 */
export async function generateFilesForPlan(planId, targetDir, io = null) {
    const plan = getCachedPlan(planId);
    if (!plan) throw new Error('Plan not found or expired. Please generate a new plan.');

    const prompt     = plan.originalPrompt || '';
    const fileSpecs  = plan.files || [];
    const totalFiles = fileSpecs.length;

    if (io) io.emit('generation:progress', { phase: 'generating', message: `Generating ${totalFiles} file(s)…` });

    const generatedFiles = [];
    for (let i = 0; i < fileSpecs.length; i++) {
        const spec = fileSpecs[i];
        if (io) io.emit('generation:progress', {
            phase: 'generating',
            message: `Generating ${i + 1}/${totalFiles}: ${spec.path}…`,
        });

        const result = await generateSingleFile(spec, plan, prompt, {});
        if (result?.file) {
            generatedFiles.push(result.file);
        }
    }

    if (io) io.emit('generation:progress', { phase: 'assembling', message: 'Writing files to disk…' });

    const results = [];
    for (const file of generatedFiles) {
        try {
            const raw     = typeof file.content === 'object'
                ? JSON.stringify(file.content, null, 2)
                : String(file.content || '');
            const content = sanitizeContent(raw, file.path);
            const absPath = path.resolve(targetDir, file.path);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, content, 'utf-8');
            results.push({ path: file.path, success: true });
        } catch (err) {
            console.error(`[agent] Failed to write ${file.path}:`, err.message);
            results.push({ path: file.path, success: false, error: err.message });
        }
    }

    return { files: results };
}

// ── Legacy: processAgentRequest ───────────────────────────────────────────────
// Kept for the old /api/ai/generate route.

export async function processAgentRequest(prompt, providedFiles = null, io = null) {
    const projectFiles = {};

    if (providedFiles) {
        Object.assign(projectFiles, providedFiles);
    } else {
        const tree = getFileTree();
        const collect = (nodes, base = '') => {
            for (const n of nodes) {
                const full = base ? `${base}/${n.name}` : n.name;
                if (n.type === 'file') projectFiles[full] = getFileContent(full);
                else if (n.children) collect(n.children, full);
            }
        };
        collect(tree);
    }

    if (io) io.emit('generation:progress', { phase: 'planning', message: 'Planning…' });

    // Use the new smart planner
    const plan = await planAndPreview(prompt);

    if (!plan?.files?.length) {
        return { message: plan?.explanation || 'No files generated. Try rephrasing.' };
    }

    if (io) io.emit('generation:progress', { phase: 'generating', message: 'Generating files…' });

    const targetDir  = getWorkingDir();
    const planWithPrompt = { ...plan, originalPrompt: prompt };
    const planId     = cachePlan(planWithPrompt);
    const { files }  = await generateFilesForPlan(planId, targetDir, io);

    return {
        explanation: plan.explanation,
        files,
        runCommand: plan.runCommand,
    };
}
