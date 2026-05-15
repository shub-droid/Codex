import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

import createAIRoutes from './routes/ai.js';
import createFileRoutes from './routes/files.js';
import createPreviewRoutes from './routes/preview.js';
import authRoutes from './routes/auth.js';
import { protect } from './middleware/auth.js';
import { registerTerminalHandlers } from './routes/terminal.js';

dotenv.config({ path: '../.env' });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Database Connection ───────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vibecode')
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ── Routes (pass io for real-time file change events) ──
app.use('/api/auth', authRoutes);
app.use('/api/ai', createAIRoutes(io));          // AI routes — open for local use
app.use('/api/files', createFileRoutes(io));     // File routes — no auth needed (local IDE)
app.use('/api/preview', createPreviewRoutes(io));

// ── Health check ───────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Socket.IO ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ── Terminal (real shell via node-pty) ─────────────────
registerTerminalHandlers(io);

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Vibecode server running on http://localhost:${PORT}\n`);
});

export { io };
