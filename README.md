# 🚀 Vibecode — AI Powered Vibe Code Editor

A **web-based IDE** that lets users build full-stack MERN applications using natural language prompts, powered by **Grok AI**, with **Monaco Editor** and **live preview**.

## ✨ Features

- **Natural Language to Code** — Describe what you want, get production-ready MERN code
- **Monaco Editor** — Full-featured code editor (the same editor as VS Code)
- **Live Preview** — See your app update in real-time as code is generated
- **AI Debugging** — Paste errors and get natural language explanations + fixes
- **Virtual File System** — Complete project structure managed in-browser
- **MERN-Specific Agent** — AI that understands React, Express, Node.js, and MongoDB

## 🛠️ Tech Stack

| Layer     | Technology       |
|-----------|-----------------|
| Frontend  | React + Vite    |
| Editor    | Monaco Editor   |
| Backend   | Express.js      |
| AI        | Grok |
| Realtime  | Socket.IO       |
| Database  | MongoDB (planned) |

## 📦 Getting Started

### Prerequisites

- Node.js 18+
- A [Grok API Key](https://console.x.ai/)

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd Codex

# Set up environment
cp .env.example .env
# Edit .env and add your GROK_API_KEY

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running

```bash
# Terminal 1 — Start the server
cd server
npm run dev

# Terminal 2 — Start the client
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📁 Project Structure

```
Codex/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── context/         # React Context providers
│   │   ├── services/        # API client
│   │   ├── hooks/           # Custom hooks
│   │   └── styles/          # Global CSS
│   └── package.json
├── server/                  # Express backend
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── middleware/           # Express middleware
│   └── package.json
├── .env                     # Environment variables
└── README.md
```

## 👥 Team

- Shubham Mallick
- Subham Sonal Panigrahi
- Subham Swaraj Beuria

## 📄 License

MIT
