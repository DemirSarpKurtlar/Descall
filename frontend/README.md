# Descall Frontend (Vite + React + Socket.IO)

## 1) Install

```bash
cd frontend
npm install
```

## 2) Configure Render backend URL

Copy `.env.example` to `.env` and set:

```bash
VITE_API_BASE_URL=https://YOUR-RENDER-URL.onrender.com
```

## 3) Run

```bash
npm run dev
```

## 4) Build for production

```bash
npm run build
npm run preview
```

## Notes

- API base URL is centralized in `src/config/api.js`.
- Socket connection is isolated in `src/socket.js`.
- Auth API calls are isolated in `src/api/auth.js`.
- JWT token and user state are persisted in localStorage.
