# Cloud Retail Microservices Platform

[![Kubernetes](https://img.shields.io/badge/Kubernetes-EKS%201.29+-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![NGINX](https://img.shields.io/badge/NGINX-Unprivileged-009639?logo=nginx&logoColor=white)](https://nginx.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RDS%2016-336791?logo=postgresql&logoColor=white)](https://aws.amazon.com/rds/)

A self-contained, production-grade 3-tier microservices workload designed for deployment on Amazon EKS.

The codebase is engineered so that **Docker handles 100% of compilation and dependency management** (multi-stage builds), and the backend microservice **automatically initialises its database schema and seeds initial retail catalog items on startup**.

---

## Architecture Overview

```text
                                 INTERNET
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │ AWS Application Load Balancer│ (ALB Ingress)
                     └──────────────┬──────────────┘
                                    │ HTTP :80
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │ Kubernetes Namespace: frontend                         │
       │                                                        │
       │   ┌──────────────────────────────────────────────┐     │
       │   │ Pod: frontend-ui (NGINX Unprivileged :8080)  │     │
       │   │  • Serves React 18 SPA static bundle         │     │
       │   │  • Reverse proxies /api/* to internal DNS   │     │
       │   └──────────────────────┬───────────────────────┘     │
       └──────────────────────────┼─────────────────────────────┘
                                  │ Private K8s DNS:
                                  │ http://backend-api.backend.svc.cluster.local:8000
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │ Kubernetes Namespace: backend                          │
       │   [NetworkPolicy: Ingress restricted to frontend pods] │
       │                                                        │
       │   ┌──────────────────────────────────────────────┐     │
       │   │ Pod: backend-api (FastAPI Python 3.11 :8000) │     │
       │   │  • Non-root runtime (UID 10001)              │     │
       │   │  • Auto-seeds catalog items on startup       │     │
       │   └──────────────────────┬───────────────────────┘     │
       └──────────────────────────┼─────────────────────────────┘
                                  │
               ┌──────────────────┴──────────────────┐
               │                                     │
               ▼                                     ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐
│ AWS Secrets Manager           │     │ Amazon RDS (PostgreSQL)       │
│ retail-app/rds/credentials    │     │ Private Database Subnet       │
│ (Synced via External Secrets) │     │ db.t4g.micro / port 5432      │
└───────────────────────────────┘     └───────────────────────────────┘
```

---

## Repository Structure

```text
cloud-retail-microservices/
├── frontend-ui/
│   ├── src/                     # React single-page UI (Vite)
│   │   ├── App.jsx              # Dashboard UI, metrics cards, catalog table, & error state
│   │   ├── main.jsx             # React DOM root mounting
│   │   └── index.css            # Clean responsive stylesheet (zero external CSS dependencies)
│   ├── index.html               # HTML entrypoint
│   ├── package.json             # NPM project definitions
│   ├── vite.config.js           # Vite configuration
│   ├── nginx.conf               # Hardened unprivileged NGINX with reverse proxy to backend
│   ├── Dockerfile               # Multi-stage build (Node 20 build -> NGINX Alpine)
│   └── k8s/
│       ├── namespace.yaml       # 'frontend' namespace manifest
│       ├── deployment.yaml      # Non-root deployment, dropped Linux capabilities
│       ├── service.yaml         # ClusterIP service (port 80 -> 8080)
│       └── ingress.yaml         # AWS ALB Ingress configuration
├── backend-api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI service connecting to PostgreSQL
│   │   ├── database.py          # SQLAlchemy setup, connection retry, & auto-seeding
│   │   └── models.py            # SQLAlchemy models
│   ├── requirements.txt         # Production Python dependencies
│   ├── Dockerfile               # Multi-stage non-root Python build (UID 10001)
│   └── k8s/
│       ├── namespace.yaml       # 'backend' namespace manifest
│       ├── deployment.yaml      # Hardened deployment with ESO secret injection
│       ├── service.yaml         # Internal ClusterIP service (port 8000)
│       ├── cluster-secret-store.yaml # AWS Secrets Manager ClusterSecretStore
│       ├── external-secret.yaml # ESO Custom Resource to fetch RDS credentials
│       └── network-policy.yaml  # Network isolation: drops non-frontend traffic
├── .gitignore
└── README.md
```

---

## Component Specifications

### 1. Frontend (`frontend-ui`)
* **Framework:** Lightweight React using Vite.
* **Dashboard Features:**
  * Header displaying `"Cloud Retail Internal Dashboard"`.
  * Real-time metrics overview: Catalog Products, Units in Stock, Inventory Valuation, and Database Connection.
  * Live catalog card/table querying `/api/products` with item status tags (`In Stock`, `Low Stock`, `Out of Stock`).
  * Explicit, user-friendly error banners and connection diagnostics if the backend or database is unreachable.
* **NGINX Configuration (`nginx.conf`):**
  * Runs as an unprivileged user on port `8080`.
  * Serves compiled static assets from `/usr/share/nginx/html`.
  * Reverse proxy block forwarding `/api/` requests to the internal Kubernetes DNS name of the backend (`http://backend-api.backend.svc.cluster.local:8000/api/`). This avoids CORS issues and keeps the backend private.
  * Health probe endpoint at `/healthz` for ALB target group checks.
* **Dockerfile:**
  * Stage 1: `node:20-alpine` runs `npm install` and `npm run build`.
  * Stage 2: `nginxinc/nginx-unprivileged:alpine` copies `/dist` output and runs rootless.

### 2. Backend (`backend-api`)
* **Framework:** Python FastAPI with `SQLAlchemy` and `psycopg2-binary`.
* **Endpoints:**
  * `GET /api/health`: Health probe endpoint validating microservice and PostgreSQL database status.
  * `GET /api/products`: Queries the `products` table and returns catalog items (`id`, `name`, `description`, `price`, `stock`).
* **Database Auto-Seeding:**
  * Auto-executes `Base.metadata.create_all(bind=engine)` upon container startup.
  * Checks if the `products` table is empty (`count == 0`).
  * If empty, automatically inserts 3 initial retail items:
    1. **Mechanical Keyboard** ($129.99, Stock: 45)
    2. **Wireless Mouse** ($49.99, Stock: 120)
    3. **USB-C Hub** ($34.50, Stock: 80)
* **Configuration:**
  * Reads `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` from environment variables (with URL-encoding for RDS password resilience).
* **Dockerfile:**
  * Multi-stage build on `python:3.11-slim`.
  * Runs as non-root user `appuser` (`UID 10001`, `GID 10001`).
  * Contains no compilers or build tools in final runtime image.

---

## Container Build & Packaging

Build and tag both container images using Docker:

```bash
# Build the frontend (compiles React and packages into NGINX rootless)
docker build -t <your-ecr-registry-uri>/retail-frontend:v1 ./frontend-ui

# Build the backend (packages FastAPI in non-root Python runtime)
docker build -t <your-ecr-registry-uri>/retail-backend:v1 ./backend-api
```

---

## Kubernetes Manifests Reference

### Backend (`backend-api/k8s/`)
| Manifest | Description |
| :--- | :--- |
| `namespace.yaml` | Declares the `backend` namespace. |
| `deployment.yaml` | Hardened deployment running under UID 10001 with dropped capabilities and credentials loaded from Secret `rds-credentials`. |
| `service.yaml` | Internal `ClusterIP` service exposing port `8000` (`backend-api.backend.svc.cluster.local`). |
| `cluster-secret-store.yaml` | ClusterSecretStore connecting External Secrets to AWS Secrets Manager through IRSA. |
| `external-secret.yaml` | External Secrets Operator resource targeting AWS Secrets Manager secret `retail-app/rds/credentials`. |
| `network-policy.yaml` | Restricts ingress to `backend-api` on port 8000 to only pods labeled with namespace `frontend`. |

### Frontend (`frontend-ui/k8s/`)
| Manifest | Description |
| :--- | :--- |
| `namespace.yaml` | Declares the `frontend` namespace. |
| `deployment.yaml` | Unprivileged deployment running under UID 101 on containerPort `8080` with dropped capabilities. |
| `service.yaml` | `ClusterIP` service exposing port `80` targeting port `8080`. |
| `ingress.yaml` | Ingress resource configured for the AWS Load Balancer Controller (`internet-facing` ALB, target-type `ip`). |

---

## Complete AWS/EKS Deployment Runbook

This is the complete deployment order. Terraform creates the AWS infrastructure,
but it does not build images, install Kubernetes controllers, or apply the
application manifests.

### Prerequisites

Install and authenticate AWS CLI, Terraform `>= 1.5.0`, `kubectl`, Helm, Docker,
and `curl`. Work from the repository root:

```bash
cd /home/cyber/Desktop/capstone-retail
aws sts get-caller-identity

export AWS_REGION=us-east-1
export CLUSTER_NAME=retail-eks-cluster
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

### 1. Apply the AWS infrastructure

Terraform creates the VPC, public/private/database subnets, NAT gateway, EKS,
managed nodes, RDS PostgreSQL, RDS security group, Secrets Manager credentials,
and IRSA roles for External Secrets and the AWS Load Balancer Controller.

```bash
terraform -chdir=infrastructure init
terraform -chdir=infrastructure fmt -check
terraform -chdir=infrastructure validate
terraform -chdir=infrastructure plan
terraform -chdir=infrastructure apply
terraform -chdir=infrastructure output
```

Confirm that AWS is ready:

```bash
aws eks describe-cluster --region "$AWS_REGION" --name "$CLUSTER_NAME" \
  --query 'cluster.status' --output text

aws rds describe-db-instances --region "$AWS_REGION" \
  --db-instance-identifier retail-db \
  --query 'DBInstances[0].DBInstanceStatus' --output text
```

Expected output is `ACTIVE` and `available`.

### 2. Connect kubectl to EKS

```bash
aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME"
kubectl get nodes -o wide
```

The application and controllers need enough pod and memory capacity. The
original `t3.small` managed node group was increased from one to two nodes:

```bash
NODEGROUP=$(aws eks list-nodegroups --region "$AWS_REGION" \
  --cluster-name "$CLUSTER_NAME" --query 'nodegroups[0]' --output text)

aws eks update-nodegroup-config --region "$AWS_REGION" \
  --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP" \
  --scaling-config minSize=1,maxSize=2,desiredSize=2
```

### 3. Install External Secrets Operator

External Secrets reads the RDS credentials from AWS Secrets Manager and creates
the Kubernetes Secret consumed by the backend:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-secrets-sa \
  --set "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:role/retail-external-secrets-irsa"
```

If local IPv6 routing prevents the chart repository from being reached, use the
published chart over IPv4:

```bash
curl -4 -fsSL \
  https://github.com/external-secrets/external-secrets/releases/download/helm-chart-2.10.0/external-secrets-2.10.0.tgz \
  -o /tmp/external-secrets-2.10.0.tgz

helm upgrade --install external-secrets /tmp/external-secrets-2.10.0.tgz \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-secrets-sa \
  --set "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:role/retail-external-secrets-irsa"
```

The installed chart serves `external-secrets.io/v1`, which is why the checked-in
External Secrets manifests use that API version.

```bash
kubectl -n external-secrets rollout status deployment/external-secrets \
  --timeout=180s
```

### 4. Install the AWS Load Balancer Controller

This controller turns the frontend Ingress into an internet-facing AWS ALB:

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

VPC_ID=$(aws eks describe-cluster --region "$AWS_REGION" \
  --name "$CLUSTER_NAME" --query 'cluster.resourcesVpcConfig.vpcId' \
  --output text)

helm upgrade --install aws-load-balancer-controller \
  eks/aws-load-balancer-controller --namespace kube-system \
  --set clusterName="$CLUSTER_NAME" --set region="$AWS_REGION" \
  --set vpcId="$VPC_ID" --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:role/retail-aws-lb-controller-irsa"

kubectl -n kube-system rollout status \
  deployment/aws-load-balancer-controller --timeout=180s
```

### 5. Create the AWS Secrets Manager ClusterSecretStore

Apply the checked-in store and the backend/frontend namespaces:

```bash
kubectl apply -f backend-api/k8s/namespace.yaml
kubectl apply -f frontend-ui/k8s/namespace.yaml
kubectl apply -f backend-api/k8s/cluster-secret-store.yaml
kubectl apply -f backend-api/k8s/external-secret.yaml

kubectl wait --for=condition=Ready \
  externalsecret/rds-credentials-sync -n backend --timeout=180s
kubectl get secret rds-credentials -n backend
```

The store uses the Terraform-created IRSA role and reads
`retail-app/rds/credentials` from Secrets Manager. It creates `DB_HOST`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME` for the backend.

### 6. Build and push images to ECR

```bash
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker build -t "$ECR_REGISTRY/retail-backend:v1" ./backend-api
docker build -t "$ECR_REGISTRY/retail-frontend:v1" ./frontend-ui

docker push "$ECR_REGISTRY/retail-backend:v1"
docker push "$ECR_REGISTRY/retail-frontend:v1"
```

If the frontend source or NGINX configuration changes, use a new tag such as
`v2` and update the frontend Deployment. The NGINX file is copied into
`/etc/nginx/conf.d/default.conf`, so it must contain a `server` block only;
top-level directives such as `pid` make NGINX crash.

### 7. Deploy the backend

```bash
kubectl apply -f backend-api/k8s/service.yaml
kubectl apply -f backend-api/k8s/network-policy.yaml

sed "s|image: retail-backend:v1.*|image: ${ECR_REGISTRY}/retail-backend:v1|" \
  backend-api/k8s/deployment.yaml | kubectl apply -f -

kubectl -n backend rollout status deployment/backend-api --timeout=240s
```

The backend is private. Its stable in-cluster address is
`backend-api.backend.svc.cluster.local:8000`.

### 8. Deploy the frontend and ALB

```bash
kubectl apply -f frontend-ui/k8s/service.yaml

sed "s|image: retail-frontend:v1.*|image: ${ECR_REGISTRY}/retail-frontend:v1|" \
  frontend-ui/k8s/deployment.yaml | kubectl apply -f -

kubectl apply -f frontend-ui/k8s/ingress.yaml
kubectl -n frontend rollout status deployment/frontend-ui --timeout=240s

export ALB_HOST=$(kubectl -n frontend get ingress retail-frontend-ingress \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "http://${ALB_HOST}"
```

### How frontend and backend communicate in AWS

The live traffic path is:

```text
Browser
  -> internet-facing AWS ALB :80
  -> frontend-ui Service :80
  -> frontend-ui Pod / NGINX :8080
  -> backend-api.backend.svc.cluster.local:8000
  -> backend-api Service :8000
  -> backend-api Pod / FastAPI :8000
  -> RDS private endpoint :5432
```

Communication is enabled by these layers:

1. **VPC routing:** EKS nodes use private subnets. RDS uses private database
   subnets in the same VPC, so the backend reaches RDS through its private
   endpoint without exposing the database publicly.
2. **RDS security group:** `infrastructure/rds.tf` allows TCP `5432` only from
   `module.eks.node_security_group_id`.
3. **Kubernetes DNS and Service:** `backend-api` is a `ClusterIP` service, so
   it is reachable only inside the cluster at
   `backend-api.backend.svc.cluster.local:8000`.
4. **NetworkPolicy:** `backend-api/k8s/network-policy.yaml` allows ingress to
   backend port `8000` only from pods in the `frontend` namespace.
5. **NGINX reverse proxy:** the browser calls the same ALB origin at
   `/api/products`; NGINX forwards `/api/*` to the private backend DNS name.
   The browser never directly accesses the backend or RDS, and CORS is avoided.

The application-level proxy is:

```nginx
location /api/ {
    proxy_pass http://backend-api.backend.svc.cluster.local:8000/api/;
}
```

### 9. Verify the full communication path

```bash
kubectl get nodes
kubectl get pods -n backend
kubectl get pods -n frontend
kubectl get externalsecret -n backend
kubectl get ingress -n frontend

curl -i "http://${ALB_HOST}/healthz"
curl -i "http://${ALB_HOST}/api/health"
curl -i "http://${ALB_HOST}/api/products"
```

Expected results:

* `/healthz` returns HTTP `200` from NGINX.
* `/api/health` returns `status: healthy` and `database: connected`.
* `/api/products` returns the seeded catalog.
* All backend and frontend replicas are `Ready`.

Diagnostics:

```bash
kubectl describe pod -n frontend -l app=frontend-ui
kubectl logs -n frontend deployment/frontend-ui
kubectl logs -n backend deployment/backend-api
kubectl describe externalsecret -n backend rds-credentials-sync
kubectl get events -A --sort-by=.lastTimestamp | tail -50
```

### Karpenter note

Terraform creates Karpenter IAM resources, but the existing Karpenter `0.16.3`
deployment must be configured with the cluster endpoint and cluster name. If it
crash-loops with `CLUSTER_ENDPOINT` or `CLUSTER_NAME` errors, keep it disabled
until it is reinstalled or configured correctly. The application can run on the
managed node group:

```bash
kubectl -n kube-system scale deployment/karpenter --replicas=0
```
### ScreenShot
<img width="1053" height="675" alt="Screenshot From 2026-09-22 10-32-43" src="https://github.com/user-attachments/assets/a090f7ba-b50c-4fe0-9a74-df0f7a6f8bd5" />
<img width="1344" height="757" alt="Screenshot From 2026-09-22 11-22-02" src="https://github.com/user-attachments/assets/f4b52859-b906-4924-ae4d-701119c22630" />
<img width="1344" height="757" alt="Screenshot From 2026-09-22 11-48-10" src="https://github.com/user-attachments/assets/d1aec6e0-9651-4726-b518-be46d3ab0cd7" />
<img width="1344" height="757" alt="Screenshot From 2026-09-22 11-49-08" src="https://github.com/user-attachments/assets/e9c8502b-b951-4c16-be34-eec8b170b71a" />
<img width="1344" height="757" alt="Screenshot From 2026-09-22 11-50-29" src="https://github.com/user-attachments/assets/9e2b4112-d328-4e64-b587-45340c5647c0" />




