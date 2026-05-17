# Kubernetes Sample CRUD App

A small full-stack task application packaged as a Kubernetes environment. The app is intentionally simple so the deployment pieces are easy to inspect: containers, services, ingress, TLS, network policies, autoscaling, disruption budgets, and PostgreSQL operations.

The Kubernetes manifests are the main material in this repo. They are numbered in apply order and include inline notes for how the pieces fit together.

For a fresh-clone setup flow, including Kubernetes prerequisites, image loading, local TLS, and CNPG startup, see [docs/KUBERNETES_SETUP.md](docs/KUBERNETES_SETUP.md).

## What Is Included

```text
sample-crud-app/
  backend/    Node.js + Express API
  frontend/   React + Vite UI served by Nginx
  gateway/    Nginx reverse proxy for frontend and API routes
  k8s/        Kubernetes manifests for the full runtime
```

## Kubernetes Layout

The current application path uses CloudNativePG for PostgreSQL:

- `00-namespace.yaml` creates the `sample-crud` namespace.
- `05` to `10` run the backend, frontend, gateway, and their internal services.
- `11-gateway-ingress.yaml` exposes the gateway through Traefik with local trusted TLS.
- `12` to `15` define network boundaries between database, backend, frontend, gateway, and ingress.
- `16` adds backend autoscaling.
- `17` to `19` protect replicas during voluntary disruptions.
- `20` and `21` create the CNPG application user and PostgreSQL cluster.
- `22` to `24` create local cert-manager TLS assets for `localhost` and `sample-crud.local`.
- `25` is the production Let's Encrypt ClusterIssuer template.

Files `01` to `04` are kept as the legacy raw PostgreSQL StatefulSet path. The backend currently points to CNPG through `postgres-cnpg-rw`, as documented in `05-backend-deployment.yaml`.

## Local Application Development

The backend uses Node.js, Express, PostgreSQL, and `pg`.

```bash
cd backend
npm install
npm run dev
```

Useful backend environment variables:

```bash
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sample_crud
DB_USER=postgres
DB_PASSWORD=postgres
```

The backend creates the `tasks` table on startup if it does not already exist.

API routes:

- `GET /api/health`
- `GET /api/db-check`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/toggle`
- `DELETE /api/tasks/:id`

The frontend uses React with Vite and Axios.

```bash
cd frontend
npm install
npm run dev
```

During local frontend development, Vite proxies `/api` requests to the backend. To point it somewhere else:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:5000 npm run dev
```

## Kubernetes Spin Up

From the `k8s/` directory, the CNPG helper script applies the main stack in dependency order:

```bash
cd k8s
./spin-up-cnpg.sh
```

The script installs or confirms the CNPG operator, creates the database cluster, applies the workloads and policies, waits for rollouts, and prints final status.

For local HTTPS with `sample-crud.local`, add this hosts entry:

```text
127.0.0.1 sample-crud.local
```

Then use the local CA resources in `22` to `24` with the ingress configuration in `11`.
