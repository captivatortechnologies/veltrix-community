#!/bin/bash
# Blue-Green Deployment Script for Veltrix
# Usage: ./blue-green-deploy.sh [service-name] [image-tag] [namespace]

set -e

SERVICE_NAME=${1:-backend}
IMAGE_TAG=${2:-latest}
NAMESPACE=${3:-veltrix}
DEPLOYMENT_NAME="${SERVICE_NAME}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting blue-green deployment for ${SERVICE_NAME}${NC}"

# Function to check deployment health
check_deployment_health() {
    local deployment=$1
    local timeout=300
    local elapsed=0
    
    echo -e "${YELLOW}Checking health of ${deployment}...${NC}"
    
    while [ $elapsed -lt $timeout ]; do
        # Check if deployment is available
        ready_replicas=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        desired_replicas=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        
        if [ "$ready_replicas" == "$desired_replicas" ] && [ "$ready_replicas" != "0" ]; then
            # Check pod health
            unhealthy=$(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME},version=${2} -o jsonpath='{.items[*].status.containerStatuses[*].ready}' | grep -o false | wc -l || echo "0")
            
            if [ "$unhealthy" == "0" ]; then
                echo -e "${GREEN}✓ Deployment ${deployment} is healthy${NC}"
                return 0
            fi
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
        echo -n "."
    done
    
    echo -e "${RED}✗ Deployment ${deployment} failed health check${NC}"
    return 1
}

# Function to get current active version
get_active_version() {
    kubectl get service ${SERVICE_NAME}-service -n ${NAMESPACE} -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo "blue"
}

# Determine current and next versions
CURRENT_VERSION=$(get_active_version)
if [ "$CURRENT_VERSION" == "blue" ]; then
    NEXT_VERSION="green"
else
    NEXT_VERSION="blue"
fi

echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"
echo -e "${BLUE}Deploying to: ${NEXT_VERSION}${NC}"

# Step 1: Create or update the green/blue deployment
echo -e "${YELLOW}Step 1: Deploying ${NEXT_VERSION} version...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEPLOYMENT_NAME}-${NEXT_VERSION}
  namespace: ${NAMESPACE}
  labels:
    app: ${SERVICE_NAME}
    version: ${NEXT_VERSION}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${SERVICE_NAME}
      version: ${NEXT_VERSION}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: ${SERVICE_NAME}
        version: ${NEXT_VERSION}
    spec:
      containers:
      - name: ${SERVICE_NAME}
        image: ${SERVICE_NAME}:${IMAGE_TAG}
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: VERSION
          value: "${NEXT_VERSION}"
        resources:
          limits:
            cpu: "1"
            memory: "1Gi"
          requests:
            cpu: "0.5"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          timeoutSeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 15
          timeoutSeconds: 5
          periodSeconds: 10
EOF

echo -e "${GREEN}✓ ${NEXT_VERSION} deployment created/updated${NC}"

# Step 2: Wait for green/blue deployment to be healthy
echo -e "${YELLOW}Step 2: Waiting for ${NEXT_VERSION} deployment to be healthy...${NC}"
if ! check_deployment_health "${DEPLOYMENT_NAME}-${NEXT_VERSION}" "${NEXT_VERSION}"; then
    echo -e "${RED}✗ ${NEXT_VERSION} deployment failed. Aborting.${NC}"
    exit 1
fi

# Step 3: Run smoke tests on green/blue deployment
echo -e "${YELLOW}Step 3: Running smoke tests on ${NEXT_VERSION} deployment...${NC}"

# Get a pod from the new deployment
NEW_POD=$(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME},version=${NEXT_VERSION} -o jsonpath='{.items[0].metadata.name}')

# Port forward temporarily for testing
kubectl port-forward -n ${NAMESPACE} pod/${NEW_POD} 8888:5000 &
PF_PID=$!
sleep 3

# Run smoke tests
SMOKE_TEST_PASSED=true
if ! curl -f http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "${RED}✗ Health check failed${NC}"
    SMOKE_TEST_PASSED=false
fi

# Kill port forward
kill $PF_PID 2>/dev/null || true

if [ "$SMOKE_TEST_PASSED" == "false" ]; then
    echo -e "${RED}✗ Smoke tests failed. Keeping ${CURRENT_VERSION} active.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Smoke tests passed${NC}"

# Step 4: Prompt for approval (optional)
if [ "${SKIP_APPROVAL}" != "true" ]; then
    echo -e "${YELLOW}Step 4: Manual approval required${NC}"
    echo -e "Ready to switch traffic from ${CURRENT_VERSION} to ${NEXT_VERSION}?"
    echo -e "Type 'yes' to proceed, 'no' to abort:"
    read -r APPROVAL
    
    if [ "$APPROVAL" != "yes" ]; then
        echo -e "${RED}Deployment aborted by user${NC}"
        exit 1
    fi
fi

# Step 5: Switch service to point to green/blue deployment
echo -e "${YELLOW}Step 5: Switching traffic to ${NEXT_VERSION}...${NC}"

kubectl patch service ${SERVICE_NAME}-service -n ${NAMESPACE} -p "{\"spec\":{\"selector\":{\"app\":\"${SERVICE_NAME}\",\"version\":\"${NEXT_VERSION}\"}}}"

echo -e "${GREEN}✓ Traffic switched to ${NEXT_VERSION}${NC}"

# Step 6: Monitor new version
echo -e "${YELLOW}Step 6: Monitoring ${NEXT_VERSION} for 60 seconds...${NC}"
sleep 60

if ! check_deployment_health "${DEPLOYMENT_NAME}-${NEXT_VERSION}" "${NEXT_VERSION}"; then
    echo -e "${RED}✗ ${NEXT_VERSION} deployment became unhealthy. Rolling back...${NC}"
    
    # Rollback: switch service back to old version
    kubectl patch service ${SERVICE_NAME}-service -n ${NAMESPACE} -p "{\"spec\":{\"selector\":{\"app\":\"${SERVICE_NAME}\",\"version\":\"${CURRENT_VERSION}\"}}}"
    
    echo -e "${GREEN}✓ Rolled back to ${CURRENT_VERSION}${NC}"
    exit 1
fi

# Step 7: Scale down old version
echo -e "${YELLOW}Step 7: Scaling down ${CURRENT_VERSION} deployment...${NC}"
kubectl scale deployment ${DEPLOYMENT_NAME}-${CURRENT_VERSION} -n ${NAMESPACE} --replicas=0 || true

echo -e "${GREEN}✓✓✓ Blue-green deployment completed successfully! ✓✓✓${NC}"
echo -e "${GREEN}Active version: ${NEXT_VERSION}${NC}"
echo -e "${BLUE}Old version (${CURRENT_VERSION}) has been scaled to 0 but not deleted for quick rollback if needed.${NC}"
