# Sample CRUD App

A simple full-stack task CRUD application for DevOps deployment practice.

This repository intentionally contains only application source code. It does not include Docker, Docker Compose, Kubernetes, or Nginx configuration.

## Project Structure

```text
sample-crud-app/
  frontend/
  backend/
```

## Backend

The backend uses Node.js, Express, PostgreSQL, and the `pg` package.

### Install Dependencies

```bash
cd backend
npm install
```

### Environment Variables

Create a `.env` file in `backend/` or export these variables in your shell:

```bash
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sample_crud
DB_USER=postgres
DB_PASSWORD=postgres
```

### Run Locally

```bash
npm run dev
```

The backend will automatically create the `tasks` table on startup if it does not already exist.

Available API routes:

- `GET /api/health`
- `GET /api/db-check`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/toggle`
- `DELETE /api/tasks/:id`

## Frontend

The frontend uses React with Vite and Axios.

### Install Dependencies

```bash
cd frontend
npm install
```

### Run Locally

Start the backend first, then run:

```bash
npm run dev
```

The frontend calls the backend using relative API paths such as `/api/tasks`. During local development, Vite proxies `/api` requests to the backend.

If your backend runs somewhere other than `http://127.0.0.1:5000`, set:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:5000 npm run dev
```

