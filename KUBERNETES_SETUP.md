# Kubernetes Setup Guide

This guide walks through running the repository from a fresh clone to a working Kubernetes, or k8s, deployment with CloudNativePG.

The app is intentionally small. The useful part is the platform shape around it: local images, namespace isolation, CNPG PostgreSQL, internal services, gateway ingress, TLS, network policies, HPA, and PDBs.

The `k8s/` directory is the main deployment surface of this repo. These manifests are written to be close to pipeline-ready: a CI/CD pipeline can build images, push them to a registry, update image references, and apply the manifests to a Kubernetes cluster. For a different cluster or environment, expect to change only the environment-specific parts such as image registry, image pull policy, ingress class, storage class, domain names, TLS issuer, and secret management.

The current workload manifests already include multi-node friendly settings. Backend, frontend, and gateway deployments use multiple replicas, topology spread constraints, pod anti-affinity, and PodDisruptionBudgets. CNPG is configured with three PostgreSQL instances. On a single-node cluster these settings still apply, but on a multi-node Kubernetes cluster you can actually observe pods spreading across nodes and disruption budgets protecting availability during node maintenance. Try the same manifests on a multi-node cluster after the local setup; no separate multi-node manifest set is required.

## 1. Install Local Tools

Install these on the machine where you will run the cluster:

- `git`
- `docker`
- `kubectl`
- a local Kubernetes cluster, such as `kind`, `minikube`, `k3d`, or `k3s`
- `cert-manager`, if you want the local trusted HTTPS flow

This repo is Kubernetes-first and should work on any conformant Kubernetes cluster, including local k8s clusters and remote/dev/staging clusters. A few manifest defaults currently match common k3s installations:

- Traefik is used as the ingress controller through `ingressClassName: traefik`.
- `local-path` is used as the storage class for CNPG.
- CNPG is installed by `k8s/spin-up-cnpg.sh`.

If your cluster uses a different ingress class or storage class, update:

- `k8s/11-gateway-ingress.yaml`
- `k8s/21-cnpg-postgres-cluster.yaml`

For CI/CD or remote Kubernetes environments, also update:

- image names in `k8s/05-backend-deployment.yaml`
- image names in `k8s/07-frontend-deployment.yaml`
- image names in `k8s/09-gateway-deployment.yaml`
- `imagePullPolicy` from `Never` to `IfNotPresent` or `Always`
- TLS/domain settings in `k8s/11-gateway-ingress.yaml`
- production issuer settings in `k8s/25-letsencrypt-prod-clusterissuer.yaml`

Check cluster access:

```bash
kubectl get nodes
kubectl get storageclass
kubectl get ingressclass
```

Expected values with the manifests as written:

- storage class: `local-path`
- ingress class: `traefik`

## 2. Clone The Repo

```bash
git clone https://github.com/utsav-mistry/kubernetes-sample-app.git
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

The backend environment references a missing secret or config. Pick one database path and keep the backend manifest aligned with it.

Current CNPG path:

- apply `20-cnpg-postgres-secret.yaml`
- apply `21-cnpg-postgres-cluster.yaml`
- keep `05-backend-deployment.yaml` pointed at `postgres-cnpg-rw`
- keep `12-postgres-networkpolicy.yaml` using the active CNPG selector

Single Postgres StatefulSet path:

- apply `01-postgres-secret.yaml`
- apply `02-postgres-configmap.yaml`
- apply `03-postgres-statefulset.yaml`
- apply `04-postgres-service.yaml`
- switch `05-backend-deployment.yaml` to the commented legacy database env block
- switch `12-postgres-networkpolicy.yaml` to the commented legacy `app: postgres` policy

Do not mix both backend database env blocks. If the backend points to a secret or config that was not applied, Kubernetes will stop the pod with `CreateContainerConfigError`.

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

When you are finished testing, remove the application namespace first. This deletes the app workloads, services, ingress, certificates, secrets, CNPG cluster object, and namespace-scoped storage claims created for this sample stack.

```bash
kubectl delete namespace sample-crud
```

Leave the CNPG operator installed if you plan to reuse it. Remove it only when this cluster no longer needs CloudNativePG for any database:

```bash
kubectl delete namespace cnpg-system
```

If you imported images into a local cluster runtime, you can leave them in place for faster rebuild cycles or remove them manually when you are done with local testing.

## What To Explore Next

Once the stack is running, the useful next step is to change one platform concern at a time and observe the effect:

- push images to a registry and switch deployments away from `imagePullPolicy: Never`
- replace local TLS with the production issuer path in `11` and `25`
- change the storage class in `21` for a different Kubernetes environment
- run the same manifests on a multi-node Kubernetes cluster and watch the existing topology spread, pod anti-affinity, PDBs, and CNPG placement behave across nodes; this is already supported by the current manifests
- test CNPG failover and watch `postgres-cnpg-rw` move to the new primary
- tune backend replicas, HPA limits, and PDB values together
- tighten or relax one NetworkPolicy at a time and verify traffic paths

The manifests are deliberately numbered and commented so each piece can be applied, inspected, changed, and rolled back independently.
