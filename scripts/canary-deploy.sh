#!/bin/bash
# Canary Deployment Script for Veltrix
# Gradually shifts traffic from stable to canary version
# Usage: ./canary-deploy.sh [service-name] [image-tag] [namespace]

set -e

SERVICE_NAME=${1:-backend}
IMAGE_TAG=${2:-latest}
NAMESPACE=${3:-veltrix}
DEPLOYMENT_NAME="${SERVICE_NAME}"

# Canary traffic percentages (progressive rollout)
CANARY_STAGES=(5 10 25 50 100)
STAGE_DURATION=60  # seconds to wait between stages

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Error thresholds
MAX_ERROR_RATE=5.0  # 5% error rate triggers rollback
MAX_LATENCY_MS=500  # 500ms P95 latency triggers rollback

echo -e "${BLUE}Starting canary deployment for ${SERVICE_NAME}${NC}"
echo -e "${BLUE}Canary stages: ${CANARY_STAGES[@]}%${NC}"

# Function to check deployment health
check_deployment_health() {
    local deployment=$1
    local timeout=300
    local elapsed=0
    
    echo -e "${YELLOW}Checking health of ${deployment}...${NC}"
    
    while [ $elapsed -lt $timeout ]; do
        ready_replicas=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        desired_replicas=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        
        if [ "$ready_replicas" == "$desired_replicas" ] && [ "$ready_replicas" != "0" ]; then
            unhealthy=$(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME},version=canary -o jsonpath='{.items[*].status.containerStatuses[*].ready}' | grep -o false | wc -l || echo "0")
            
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

# Function to check error rate (mock - would integrate with monitoring)
check_error_rate() {
    local version=$1
    
    # In production, this would query Prometheus/CloudWatch/etc
    # For now, return mock data
    echo "1.2"  # Mock 1.2% error rate
}

# Function to check latency (mock - would integrate with APM)
check_latency() {
    local version=$1
    
    # In production, this would query APM/Prometheus
    # For now, return mock data
    echo "150"  # Mock 150ms P95 latency
}

# Function to calculate canary replica count
calculate_replicas() {
    local percentage=$1
    local stable_replicas=$(kubectl get deployment ${DEPLOYMENT_NAME}-stable -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "2")
    
    # Calculate canary replicas based on percentage
    local canary_replicas=$(awk "BEGIN {printf \"%.0f\", ($stable_replicas * $percentage / 100)}")
    
    # Minimum 1 replica for canary
    if [ "$canary_replicas" -lt 1 ]; then
        canary_replicas=1
    fi
    
    echo $canary_replicas
}

# Function to perform rollback
rollback() {
    echo -e "${RED}!!! ROLLING BACK CANARY DEPLOYMENT !!!${NC}"
    
    # Scale canary to 0
    kubectl scale deployment ${DEPLOYMENT_NAME}-canary -n ${NAMESPACE} --replicas=0
    
    # Remove canary version from service selector (traffic back to 100% stable)
    kubectl patch service ${SERVICE_NAME}-service -n ${NAMESPACE} -p '{"spec":{"selector":{"version":"stable"}}}'
    
    echo -e "${GREEN}✓ Rollback completed. Traffic restored to stable version.${NC}"
    exit 1
}

# Step 1: Ensure stable deployment exists
echo -e "${YELLOW}Step 1: Verifying stable deployment...${NC}"
if ! kubectl get deployment ${DEPLOYMENT_NAME}-stable -n ${NAMESPACE} &> /dev/null; then
    echo -e "${YELLOW}Stable deployment doesn't exist. Creating from current deployment...${NC}"
    
    # If main deployment exists, copy it to stable
    if kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} &> /dev/null; then
        kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o yaml | \
            sed "s/name: ${DEPLOYMENT_NAME}/name: ${DEPLOYMENT_NAME}-stable/" | \
            sed "s/app: ${SERVICE_NAME}/app: ${SERVICE_NAME}\\n    version: stable/" | \
            kubectl apply -f -
    else
        echo -e "${RED}No existing deployment found. Please deploy stable version first.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Stable deployment verified${NC}"

# Step 2: Deploy canary version
echo -e "${YELLOW}Step 2: Deploying canary version...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEPLOYMENT_NAME}-canary
  namespace: ${NAMESPACE}
  labels:
    app: ${SERVICE_NAME}
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${SERVICE_NAME}
      version: canary
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: ${SERVICE_NAME}
        version: canary
    spec:
      containers:
      - name: ${SERVICE_NAME}
        image: ${SERVICE_NAME}:${IMAGE_TAG}
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: VERSION
          value: "canary"
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

echo -e "${GREEN}✓ Canary deployment created${NC}"

# Step 3: Wait for canary to be healthy
echo -e "${YELLOW}Step 3: Waiting for canary to be healthy...${NC}"
if ! check_deployment_health "${DEPLOYMENT_NAME}-canary"; then
    rollback
fi

# Step 4: Update service to include both stable and canary (removes version selector)
echo -e "${YELLOW}Step 4: Configuring service for traffic splitting...${NC}"
kubectl patch service ${SERVICE_NAME}-service -n ${NAMESPACE} -p '{"spec":{"selector":{"app":"'${SERVICE_NAME}'"}}}'
echo -e "${GREEN}✓ Service configured for traffic splitting${NC}"

# Step 5: Progressive rollout through canary stages
for PERCENTAGE in "${CANARY_STAGES[@]}"; do
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}Canary Stage: ${PERCENTAGE}% traffic${NC}"
    echo -e "${BLUE}======================================${NC}"
    
    # Calculate and set replica counts
    CANARY_REPLICAS=$(calculate_replicas $PERCENTAGE)
    
    if [ "$PERCENTAGE" -eq 100 ]; then
        # At 100%, scale up canary to match stable, then scale down stable
        STABLE_REPLICAS=$(kubectl get deployment ${DEPLOYMENT_NAME}-stable -n ${NAMESPACE} -o jsonpath='{.spec.replicas}')
        CANARY_REPLICAS=$STABLE_REPLICAS
        
        echo -e "${YELLOW}Scaling canary to ${CANARY_REPLICAS} replicas (100%)${NC}"
        kubectl scale deployment ${DEPLOYMENT_NAME}-canary -n ${NAMESPACE} --replicas=${CANARY_REPLICAS}
        
        sleep 30  # Wait for canary to scale up
        
        echo -e "${YELLOW}Scaling stable to 0 replicas${NC}"
        kubectl scale deployment ${DEPLOYMENT_NAME}-stable -n ${NAMESPACE} --replicas=0
    else
        echo -e "${YELLOW}Scaling canary to ${CANARY_REPLICAS} replicas (~${PERCENTAGE}%)${NC}"
        kubectl scale deployment ${DEPLOYMENT_NAME}-canary -n ${NAMESPACE} --replicas=${CANARY_REPLICAS}
    fi
    
    # Wait for scaling to complete
    sleep 15
    
    # Verify canary health
    if ! check_deployment_health "${DEPLOYMENT_NAME}-canary"; then
        rollback
    fi
    
    # Monitor metrics for this stage
    echo -e "${YELLOW}Monitoring metrics for ${STAGE_DURATION} seconds...${NC}"
    
    for i in $(seq 1 $STAGE_DURATION); do
        # Check metrics every 10 seconds
        if [ $((i % 10)) -eq 0 ]; then
            ERROR_RATE=$(check_error_rate "canary")
            LATENCY=$(check_latency "canary")
            
            echo -e "${BLUE}[${i}s] Error rate: ${ERROR_RATE}%, P95 latency: ${LATENCY}ms${NC}"
            
            # Check if metrics exceed thresholds
            if (( $(awk "BEGIN {print ($ERROR_RATE > $MAX_ERROR_RATE)}") )); then
                echo -e "${RED}!!! Error rate (${ERROR_RATE}%) exceeds threshold (${MAX_ERROR_RATE}%) !!!${NC}"
                rollback
            fi
            
            if [ "$LATENCY" -gt "$MAX_LATENCY_MS" ]; then
                echo -e "${RED}!!! Latency (${LATENCY}ms) exceeds threshold (${MAX_LATENCY_MS}ms) !!!${NC}"
                rollback
            fi
        fi
        
        sleep 1
    done
    
    echo -e "${GREEN}✓ Stage ${PERCENTAGE}% completed successfully${NC}"
    
    # Manual approval for significant stages (optional)
    if [ "$PERCENTAGE" -eq 50 ] && [ "${SKIP_APPROVAL}" != "true" ]; then
        echo -e "${YELLOW}Manual approval required to proceed to ${PERCENTAGE}% → 100%${NC}"
        echo -e "Type 'yes' to proceed, 'no' to rollback:"
        read -r APPROVAL
        
        if [ "$APPROVAL" != "yes" ]; then
            rollback
        fi
    fi
done

# Step 6: Promote canary to stable
echo -e "${YELLOW}Step 6: Promoting canary to stable...${NC}"

# Delete old stable deployment
kubectl delete deployment ${DEPLOYMENT_NAME}-stable -n ${NAMESPACE}

# Rename canary to stable
kubectl get deployment ${DEPLOYMENT_NAME}-canary -n ${NAMESPACE} -o yaml | \
    sed "s/name: ${DEPLOYMENT_NAME}-canary/name: ${DEPLOYMENT_NAME}-stable/" | \
    sed "s/version: canary/version: stable/" | \
    kubectl apply -f -

# Delete canary deployment
kubectl delete deployment ${DEPLOYMENT_NAME}-canary -n ${NAMESPACE}

# Update service to point to stable only
kubectl patch service ${SERVICE_NAME}-service -n ${NAMESPACE} -p '{"spec":{"selector":{"app":"'${SERVICE_NAME}'","version":"stable"}}}'

echo -e "${GREEN}✓✓✓ Canary deployment completed successfully! ✓✓✓${NC}"
echo -e "${GREEN}New version is now stable and receiving 100% traffic${NC}"
