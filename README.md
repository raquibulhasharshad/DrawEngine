# 🌌 DrawEngine: Modern 2D Design Platform

DrawEngine is a high-performance, full-stack 2D design application featuring a **C++ Drogon** backend and a **React/Vite** frontend. Built for speed, security, and scalability.

## 🚀 Architecture Overview

- **Frontend**: React + Vite + Tailwind CSS.
- **Backend**: C++ (Drogon Framework) + OpenSSL (PBKDF2 Hashing).
- **Database**: Neon PostgreSQL (Production-ready & serverless).
- **Authentication**: Secure Cookie-based JWT sessions.

---

## 🛠️ Local Development

### Backend (C++)
1. Ensure `vcpkg`, `cmake`, and a C++17 compiler are installed.
2. Initialize environment:
   ```bash
   cp Backend/.env.example Backend/.env
   # Edit Backend/.env with your local DB credentials
   ```
3. Build and Run:
   ```bash
   cd Backend
   mkdir build && cd build
   cmake .. -DCMAKE_TOOLCHAIN_FILE=C:/path/to/vcpkg/scripts/buildsystems/vcpkg.cmake
   cmake --build . --config Debug
   ./Debug/DrawEngine.exe
   ```

### Frontend (React)
1. Install Node.js (v18+).
2. Initialize environment:
   ```bash
   cp Frontend/.env.example Frontend/.env
   # Set VITE_API_BASE_URL to http://localhost:8080/api/
   ```
3. Run Development Server:
   ```bash
   cd Frontend
   npm install
   npm run dev
   ```

---

## 🐳 Docker Deployment

The project is fully dockerized for cloud deployment. Each component build is isolated and optimized.

### Backend
```bash
cd Backend
docker build -t drawengine-backend .
docker run -p 8080:8080 --env-file .env drawengine-backend
```

### Frontend
```bash
cd Frontend
docker build -t drawengine-frontend .
docker run -p 80:80 drawengine-frontend
```

---

## 🌍 Deploying to Render

### 1. Backend (Web Service)
- **Repo**: Push this code to GitHub.
- **Runtime**: `Docker`.
- **Plan**: `Starter` (needed for C++ builds).
- **Env Vars**:
    - `DATABASE_URL`: Your Neon PostgreSQL connection string.
    - `JWT_SECRET`: A long random string.
    - `PORT`: 8080.
    - `ALLOWED_ORIGIN`: The URL of your live frontend (once available).

### 2. Frontend (Static Site or Web Service)
- **Option A (Static Site)**:
    - **Build Command**: `npm run build`
    - **Publish Directory**: `dist`
- **Option B (Docker)**:
    - **Runtime**: `Docker`.
- **Env Vars**:
    - `VITE_API_BASE_URL`: The URL of your deployed Backend service (followed by `/api/`).

---

## 🛡️ Security Note
All passwords are hashed using **PBKDF2 with 10,000 iterations and 16-byte random salts**. The platform supports legacy-aware migration, meaning old users are automatically secured upon their next login.

---

## 📜 License
MIT
