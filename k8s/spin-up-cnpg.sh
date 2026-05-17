#!/bin/bash
set -euo pipefail

NS="sample-crud"
CNPG_NS="cnpg-system"
CNPG_CLUSTER="postgres-cnpg"

echo "==> Creating namespace"
kubectl apply -f 00-namespace.yaml

echo "==> Installing / confirming CNPG operator"
kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.27/releases/cnpg-1.27.0.yaml

echo "==> Waiting for CNPG operator"
kubectl rollout status deployment/cnpg-controller-manager -n "$CNPG_NS" --timeout=600s

echo "==> Applying CNPG secret"
kubectl apply -f 20-cnpg-postgres-secret.yaml

echo "==> Applying CNPG cluster"
kubectl apply -f 21-cnpg-postgres-cluster.yaml

echo "==> Waiting for CNPG cluster object"
until kubectl get cluster "$CNPG_CLUSTER" -n "$NS" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Waiting for CNPG cluster health"
kubectl wait cluster "$CNPG_CLUSTER" -n "$NS" \
  --for=jsonpath='{.status.phase}'="Cluster in healthy state" \
  --timeout=300s || true

echo "==> Waiting for CNPG pods"
kubectl wait --for=condition=Ready pod \
  -l cnpg.io/cluster="$CNPG_CLUSTER" \
  -n "$NS" \
  --timeout=300s

echo "==> Applying application workloads"
kubectl apply -f 05-backend-deployment.yaml
kubectl apply -f 06-backend-service.yaml
kubectl apply -f 07-frontend-deployment.yaml
kubectl apply -f 08-frontend-service.yaml
kubectl apply -f 09-gateway-deployment.yaml
kubectl apply -f 10-gateway-service.yaml
kubectl apply -f 11-gateway-ingress.yaml

echo "==> Applying policies, HPA, and PDBs"
kubectl apply -f 12-postgres-networkpolicy.yaml
kubectl apply -f 13-backend-networkpolicy.yaml
kubectl apply -f 14-frontend-networkpolicy.yaml
kubectl apply -f 15-gateway-networkpolicy.yaml
kubectl apply -f 16-backend-hpa.yaml
kubectl apply -f 17-backend-pdb.yaml
kubectl apply -f 18-frontend-pdb.yaml
kubectl apply -f 19-gateway-pdb.yaml

echo "==> Waiting for deployments"
kubectl rollout status deployment/backend -n "$NS" --timeout=600s
kubectl rollout status deployment/frontend -n "$NS" --timeout=600s
kubectl rollout status deployment/nginx-gateway -n "$NS" --timeout=600s

echo "==> Final status"
kubectl get pods -n "$NS" -o wide
kubectl get svc -n "$NS"
kubectl get pvc -n "$NS"
kubectl get cluster -n "$NS"
kubectl get hpa,pdb -n "$NS"

echo "==> Spin-up complete"