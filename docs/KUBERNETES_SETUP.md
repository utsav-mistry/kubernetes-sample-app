# Kubernetes Setup Guide

This guide walks through running the repository from a fresh clone to a working Kubernetes deployment with CloudNativePG.

The app is intentionally small. The useful part is the platform shape around it: local images, namespace isolation, CNPG PostgreSQL, internal services, gateway ingress, TLS, network policies, HPA, and PDBs.

## 1. Install Local Tools

Install these on the machine where you will run the cluster:

- `git`
- `docker`
- `kubectl`
- a local Kubernetes cluster, such as `k3s`, `k3d`, `kind`, or `minikube`
- `cert-manager`, if you want the local trusted HTTPS flow

This repo is currently tuned for a k3s-style local cluster:

- Traefik is used as the ingress controller.
- `local-path` is used as the storage class for CNPG.
- CNPG is installed by `k8s/spin-up-cnpg.sh`.

Check cluster access:

```bash
kubectl get nodes
kubectl get storageclass
kubectl get ingressclass
```

Expected local k3s-style values:

- storage class: `local-path`
- ingress class: `traefik`

## 2. Clone The Repo

```bash
git clone <repo-url>
cd kubernetes-sample-app
```

Copy the backend environment example only for local Node.js development:

```bash
cp backend/.env.example backend/.env
```

Do not commit `backend/.env`. It is intentionally ignored.

## 3. Build Application Images

The Kubernetes manifests use local image tags and `imagePullPolicy: Never`, so the images must exist inside the cluster runtime before pods can start.

Build the images:

```bash
docker build -t sample-crud-backend:1.0.1 ./backend
docker build -t sample-crud-frontend:1.0.0 ./frontend
docker build -t sample-crud-gateway:1.0.0 ./gateway
```

If your cluster can see the Docker daemon directly, this may be enough. Many local clusters use a separate container runtime, so load the images into the cluster as needed.

For k3s:

```bash
docker save sample-crud-backend:1.0.1 -o backend.tar
docker save sample-crud-frontend:1.0.0 -o frontend.tar
docker save sample-crud-gateway:1.0.0 -o gateway.tar

sudo k3s ctr images import backend.tar
sudo k3s ctr images import frontend.tar
sudo k3s ctr images import gateway.tar
```

For kind:

```bash
kind load docker-image sample-crud-backend:1.0.1
kind load docker-image sample-crud-frontend:1.0.0
kind load docker-image sample-crud-gateway:1.0.0
```

For minikube:

```bash
minikube image load sample-crud-backend:1.0.1
minikube image load sample-crud-frontend:1.0.0
minikube image load sample-crud-gateway:1.0.0
```

## 4. Install cert-manager

This is needed for the local TLS manifests:

- `22-local-root-ca.yaml`
- `23-local-ca-issuer.yaml`
- `24-localhost-tls-certificate.yaml`

If cert-manager is already installed, confirm it:

```bash
kubectl get pods -n cert-manager
kubectl get crd certificates.cert-manager.io
```

If it is not installed, install it with the method you normally use for your cluster. After installation, wait until the cert-manager pods are ready.

## 5. Create Namespace And Local TLS

From the repo root:

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/22-local-root-ca.yaml
kubectl apply -f k8s/23-local-ca-issuer.yaml
kubectl apply -f k8s/24-localhost-tls-certificate.yaml
```

Wait for the certificate secret:

```bash
kubectl wait --for=condition=Ready certificate/sample-crud-localhost-tls -n sample-crud --timeout=180s
kubectl get secret sample-crud-localhost-tls -n sample-crud
```

Add the local domain to `/etc/hosts`:

```text
127.0.0.1 sample-crud.local
```

For fully trusted browser HTTPS, export the root CA from `sample-crud-root-ca-secret` and install it into your OS/browser trust store.

## 6. Start CNPG And The App

The helper script installs or confirms the CloudNativePG operator, creates the CNPG cluster, applies the workloads, applies policies/HPA/PDBs, and waits for rollouts.

```bash
cd k8s
chmod +x spin-up-cnpg.sh
./spin-up-cnpg.sh
```

The current database path is:

```text
backend -> postgres-cnpg-rw -> CNPG primary
```

The legacy raw StatefulSet manifests are still present in `01` to `04`, but they are not the active path.

## 7. Verify The Deployment

Check pods:

```bash
kubectl get pods -n sample-crud -o wide
```

Check services:

```bash
kubectl get svc -n sample-crud
```

Check CNPG:

```bash
kubectl get cluster -n sample-crud
kubectl get pods -n sample-crud -l cnpg.io/cluster=postgres-cnpg
```

Check ingress:

```bash
kubectl get ingress -n sample-crud
```

Check app health through the gateway:

```bash
curl -k https://localhost/api/health
curl -k https://localhost/api/db-check
curl -k https://sample-crud.local/api/health
```

Open the app:

```text
https://localhost
https://sample-crud.local
```

## 8. Useful Operations

Restart a deployment after rebuilding and reloading an image:

```bash
kubectl rollout restart deployment/backend -n sample-crud
kubectl rollout restart deployment/frontend -n sample-crud
kubectl rollout restart deployment/nginx-gateway -n sample-crud
```

Watch rollout status:

```bash
kubectl rollout status deployment/backend -n sample-crud
kubectl rollout status deployment/frontend -n sample-crud
kubectl rollout status deployment/nginx-gateway -n sample-crud
```

Inspect backend logs:

```bash
kubectl logs -n sample-crud deployment/backend
```

Inspect CNPG pods:

```bash
kubectl describe cluster postgres-cnpg -n sample-crud
kubectl logs -n sample-crud -l cnpg.io/cluster=postgres-cnpg
```

## 9. Common Problems

`ImagePullBackOff` or `ErrImageNeverPull`

The image is not loaded into the cluster runtime. Rebuild the image, load it into the cluster, then restart the deployment.

`CreateContainerConfigError` on backend

The backend environment references a missing secret or config. For the current CNPG path, `20-cnpg-postgres-secret.yaml` and `21-cnpg-postgres-cluster.yaml` must exist, and `05-backend-deployment.yaml` should point to `postgres-cnpg-rw`.

Ingress works but HTTPS shows an untrusted certificate

The local certificate may exist, but your machine/browser does not trust the local root CA. Install the CA from `sample-crud-root-ca-secret` into your trust store, or use `curl -k` for testing.

CNPG pods are not ready

Check storage and operator health:

```bash
kubectl get pods -n cnpg-system
kubectl get storageclass
kubectl describe cluster postgres-cnpg -n sample-crud
```

HPA shows unknown metrics

Install or fix metrics-server. HPA needs resource metrics and the backend deployment needs CPU requests, which are already defined in `05-backend-deployment.yaml`.

## 10. Cleanup

Remove the app namespace:

```bash
kubectl delete namespace sample-crud
```

Remove CNPG operator only if you do not need it for other clusters:

```bash
kubectl delete namespace cnpg-system
```

If you imported images into k3s, remove them manually only when you are done with local testing.
