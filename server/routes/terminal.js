/**
 * terminal.js — Real shell terminal via node-pty + Socket.IO
 *
 * Each connected socket gets its own PTY process (cmd.exe on Windows).
 * I/O is streamed bidirectionally: keystrokes from the browser drive the
 * shell, and shell output is pushed back to the browser in real-time.
 *
 * Additionally, a shared fs.watch watcher monitors the project working
 * directory so that ANY file-system change (from the terminal or elsewhere)
 * instantly triggers a `files:changed` event — keeping the sidebar in sync.
 */

import os   from 'os';
import fs   from 'fs';
import path from 'path';
import * as pty from 'node-pty';
import { getWorkingDir } from '../services/fileManager.js';

const SHELL      = os.platform() === 'win32' ? 'cmd.exe' : 'bash';
const IS_WINDOWS = os.platform() === 'win32';

// ── Shared file-system watcher ────────────────────────────────────────────────
// One watcher per server process. Tracks the current workingDir and emits
// `files:changed` to all connected clients on any fs event.

let fsWatcher       = null;     // the active fs.watch handle
let watchedDir      = null;     // the directory currently being watched
let debounceTimer   = null;     // coalesce rapid events into one broadcast
let broadcastFn     = null;     // set once io is available

/**
 * (Re-)start the watcher on `dir`.
 * Safe to call multiple times — closes the previous watcher first.
 */
function startWatcher(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  if (watchedDir === dir && fsWatcher) return; // already watching

  stopWatcher();
  watchedDir = dir;

  try {
    fsWatcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      // Ignore noise from node_modules, .git, and temp files
      if (!filename) return;
      const normalised = filename.replace(/\\/g, '/');
      if (
        normalised.includes('node_modules') ||
        normalised.includes('.git')         ||
        normalised.endsWith('~')            ||
        normalised.endsWith('.tmp')
      ) return;

      // Debounce: coalesce bursts of events (e.g. npm install) into one broadcast
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (broadcastFn) broadcastFn();
      }, 300);
    });

    fsWatcher.on('error', () => { /* ignore watch errors */ });
    console.log(`[Terminal] Watching "${dir}" for changes`);
  } catch (err) {
    console.warn('[Terminal] Could not start fs.watch:', err.message);
  }
}

function stopWatcher() {
  clearTimeout(debounceTimer);
  if (fsWatcher) {
    try { fsWatcher.close(); } catch (_) {}
    fsWatcher  = null;
    watchedDir = null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Register terminal Socket.IO handlers on the given io instance.
 * @param {import('socket.io').Server} io
 */
export function registerTerminalHandlers(io) {
  // Wire the broadcast function so the watcher can reach all clients
  broadcastFn = () => {
    io.emit('files:changed', { action: 'fs-watch', path: watchedDir });
  };

  // Start watching the project dir immediately on boot
  startWatcher(getWorkingDir());

  io.on('connection', (socket) => {
    let ptyProcess = null;

    // ── Spawn shell ───────────────────────────────────────────────
    socket.on('terminal:create', ({ cols = 80, rows = 24 } = {}) => {
      if (ptyProcess) {
        try { ptyProcess.kill(); } catch (_) {}
        ptyProcess = null;
      }

      // Always use the current project working dir (not the server cwd)
      const cwd = getWorkingDir();

      // Re-start the watcher if the working dir changed
      startWatcher(cwd);

      try {
        ptyProcess = pty.spawn(SHELL, [], {
          name: 'xterm-color',
          cols,
          rows,
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            // Keep Windows cmd colours working
            ...(IS_WINDOWS ? { PROMPT: '$P$G' } : {}),
          },
        });

      // ── Detect current directory from cmd prompt ──────────────
      // Windows cmd prompt format (with PROMPT=$P$G): C:\path\to\dir>
      // We parse this to track the user's cd changes in real-time.
      const CMD_PROMPT_RE = /([A-Za-z]:[^\r\n>]*[^\s>])>/;
      let lastEmittedCwd = cwd;

      // Shell output → browser (+ CWD detection)
      ptyProcess.onData((data) => {
        socket.emit('terminal:output', data);

        // Check if the output contains a prompt that reveals the new CWD
        const match = data.match(CMD_PROMPT_RE);
        if (match) {
          // Strip ANSI codes, wildcards, git status markers, and trailing whitespace
          const detectedCwd = match[1]
            .replace(/\x1b\[[0-9;]*m/g, '')   // ANSI colour codes
            .replace(/[*?[\]]/g, '')            // wildcards / git markers
            .trim();
          if (detectedCwd && /^[A-Za-z]:/.test(detectedCwd) && detectedCwd !== lastEmittedCwd) {
            lastEmittedCwd = detectedCwd;
            socket.emit('terminal:cwd', { dir: detectedCwd });
          }
        }
      });

      // Shell exit → browser
        ptyProcess.onExit(({ exitCode }) => {
          socket.emit('terminal:exit', { exitCode });
          ptyProcess = null;
        });

        socket.emit('terminal:ready', { pid: ptyProcess.pid, cwd });
        console.log(`[Terminal] PTY spawned pid=${ptyProcess.pid} cwd="${cwd}"`);
      } catch (err) {
        console.error('[Terminal] Failed to spawn PTY:', err);
        socket.emit('terminal:error', { message: err.message });
      }
    });

    // ── Keystrokes / paste → shell stdin ─────────────────────────
    socket.on('terminal:input', (data) => {
      if (ptyProcess) try { ptyProcess.write(data); } catch (_) {}
    });

    // ── Panel resize → PTY resize ─────────────────────────────────
    socket.on('terminal:resize', ({ cols, rows }) => {
      if (ptyProcess && cols > 0 && rows > 0) {
        try { ptyProcess.resize(cols, rows); } catch (_) {}
      }
    });

    // ── Working dir changed (e.g. user opened a folder) ──────────
    // Client or another route emits this so the watcher follows along
    socket.on('terminal:chdir', ({ dir } = {}) => {
      if (dir) startWatcher(dir);
    });

    // ── Run a command programmatically (e.g. from AI accept) ─────
    socket.on('terminal:run', ({ command } = {}) => {
      if (ptyProcess && command) {
        try {
          ptyProcess.write(command + '\r');
        } catch (_) {}
      }
    });

    // ── Cleanup on disconnect ─────────────────────────────────────
    socket.on('disconnect', () => {
      if (ptyProcess) {
        try { ptyProcess.kill(); } catch (_) {}
        ptyProcess = null;
      }
    });
  });
}
