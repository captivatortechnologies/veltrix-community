#!/bin/bash
# Automated Rollback Script for Veltrix
# Monitors deployments and triggers rollback on failure
# Usage: ./auto-rollback.sh [service-name] [namespace]

set -e

SERVICE_NAME=${1:-backend}
NAMESPACE=${2:-veltrix}
DEPLOYMENT_NAME="${SERVICE_NAME}"

# Monitoring configuration
CHECK_INTERVAL=30  # seconds between health checks
ERROR_THRESHOLD=5.0  # 5% error rate triggers rollback
LATENCY_THRESHOLD=500  # 500ms P95 latency triggers rollback
FAILED_CHECKS_THRESHOLD=3  # consecutive failed checks before rollback

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Starting automated rollback monitor for ${SERVICE_NAME}${NC}"

# Counter for consecutive failures
FAILED_CHECKS=0

# Function to get current deployment revision
get_current_revision() {
    kubectl rollout history deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} | tail -2 | head -1 | awk '{print $1}'
}

# Function to get previous revision
get_previous_revision() {
    local current=$(get_current_revision)
    echo $((current - 1))
}

# Function to check pod health
check_pod_health() {
    local unhealthy_pods=$(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME} \
        -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[*].ready}{"\n"}{end}' | \
        grep -c false || echo "0")
    
    if [ "$unhealthy_pods" -gt 0 ]; then
        echo -e "${RED}✗ ${unhealthy_pods} unhealthy pods detected${NC}"
        return 1
    fi
    
    return 0
}

# Function to check deployment status
check_deployment_status() {
    local available=$(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} \
        -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null || echo "False")
    
    local progressing=$(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} \
        -o jsonpath='{.status.conditions[?(@.type=="Progressing")].status}' 2>/dev/null || echo "False")
    
    if [ "$available" != "True" ] || [ "$progressing" != "True" ]; then
        echo -e "${RED}✗ Deployment status: Available=${available}, Progressing=${progressing}${NC}"
        return 1
    fi
    
    return 0
}

# Function to check error rate (mock - integrate with monitoring)
check_error_rate() {
    # In production, query Prometheus with:
    # rate(http_requests_total{job="${SERVICE_NAME}",status=~"5.."}[5m]) / rate(http_requests_total{job="${SERVICE_NAME}"}[5m]) * 100
    
    # Mock implementation
    local error_rate=$(awk -v min=0 -v max=10 'BEGIN{srand(); print min+rand()*(max-min)}')
    echo $error_rate
}

# Function to check latency (mock - integrate with APM)
check_latency() {
    # In production, query Prometheus with:
    # histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${SERVICE_NAME}"}[5m])) * 1000
    
    # Mock implementation
    local latency=$(awk -v min=100 -v max=600 'BEGIN{srand(); print int(min+rand()*(max-min))}')
    echo $latency
}

# Function to check replica count
check_replica_count() {
    local desired=$(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}')
    local ready=$(kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' || echo "0")
    
    if [ "$ready" != "$desired" ]; then
        echo -e "${RED}✗ Replica mismatch: ${ready}/${desired} ready${NC}"
        return 1
    fi
    
    return 0
}

# Function to perform rollback
perform_rollback() {
    local reason=$1
    
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}!!! INITIATING AUTOMATIC ROLLBACK !!!${NC}"
    echo -e "${RED}Reason: ${reason}${NC}"
    echo -e "${RED}========================================${NC}"
    
    # Get previous revision
    PREVIOUS_REVISION=$(get_previous_revision)
    
    if [ "$PREVIOUS_REVISION" -lt 1 ]; then
        echo -e "${RED}No previous revision found. Cannot rollback.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Rolling back to revision ${PREVIOUS_REVISION}...${NC}"
    
    # Perform rollback
    if kubectl rollout undo deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} --to-revision=${PREVIOUS_REVISION}; then
        echo -e "${GREEN}✓ Rollback command issued${NC}"
        
        # Wait for rollback to complete
        echo -e "${YELLOW}Waiting for rollback to complete...${NC}"
        if kubectl rollout status deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} --timeout=300s; then
            echo -e "${GREEN}✓✓✓ Rollback completed successfully ✓✓✓${NC}"
            
            # Send notification (implement with your notification system)
            send_notification "ROLLBACK" "${SERVICE_NAME}" "${reason}"
            
            exit 0
        else
            echo -e "${RED}✗ Rollback failed or timed out${NC}"
            send_notification "ROLLBACK_FAILED" "${SERVICE_NAME}" "Rollback timed out"
            exit 1
        fi
    else
        echo -e "${RED}✗ Rollback command failed${NC}"
        exit 1
    fi
}

# Function to send notifications (mock - integrate with Slack/Teams/Email)
send_notification() {
    local event_type=$1
    local service=$2
    local message=$3
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Log to file
    echo "[${timestamp}] ${event_type}: ${service} - ${message}" >> /tmp/veltrix-rollback.log
    
    # In production, send to Slack/Teams/PagerDuty:
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"🚨 ${event_type}: ${service}\n${message}\"}" \
    #   $SLACK_WEBHOOK_URL
    
    echo -e "${BLUE}Notification sent: ${event_type} - ${message}${NC}"
}

# Main monitoring loop
echo -e "${GREEN}Monitoring ${SERVICE_NAME} in namespace ${NAMESPACE}${NC}"
echo -e "${BLUE}Check interval: ${CHECK_INTERVAL}s${NC}"
echo -e "${BLUE}Error threshold: ${ERROR_THRESHOLD}%${NC}"
echo -e "${BLUE}Latency threshold: ${LATENCY_THRESHOLD}ms${NC}"
echo -e "${BLUE}Failed checks threshold: ${FAILED_CHECKS_THRESHOLD}${NC}"
echo ""

while true; do
    HEALTH_CHECK_PASSED=true
    FAILURE_REASON=""
    
    echo -e "${BLUE}[$(date '+%H:%M:%S')] Running health checks...${NC}"
    
    # Check 1: Pod health
    if ! check_pod_health; then
        HEALTH_CHECK_PASSED=false
        FAILURE_REASON="Unhealthy pods detected"
    fi
    
    # Check 2: Deployment status
    if ! check_deployment_status; then
        HEALTH_CHECK_PASSED=false
        FAILURE_REASON="Deployment status unhealthy"
    fi
    
    # Check 3: Replica count
    if ! check_replica_count; then
        HEALTH_CHECK_PASSED=false
        FAILURE_REASON="Replica count mismatch"
    fi
    
    # Check 4: Error rate
    ERROR_RATE=$(check_error_rate)
    if (( $(awk "BEGIN {print ($ERROR_RATE > $ERROR_THRESHOLD)}") )); then
        echo -e "${RED}✗ Error rate too high: ${ERROR_RATE}% (threshold: ${ERROR_THRESHOLD}%)${NC}"
        HEALTH_CHECK_PASSED=false
        FAILURE_REASON="Error rate ${ERROR_RATE}% exceeds threshold ${ERROR_THRESHOLD}%"
    else
        echo -e "${GREEN}✓ Error rate: ${ERROR_RATE}%${NC}"
    fi
    
    # Check 5: Latency
    LATENCY=$(check_latency)
    if [ "$LATENCY" -gt "$LATENCY_THRESHOLD" ]; then
        echo -e "${RED}✗ Latency too high: ${LATENCY}ms (threshold: ${LATENCY_THRESHOLD}ms)${NC}"
        HEALTH_CHECK_PASSED=false
        FAILURE_REASON="P95 latency ${LATENCY}ms exceeds threshold ${LATENCY_THRESHOLD}ms"
    else
        echo -e "${GREEN}✓ P95 latency: ${LATENCY}ms${NC}"
    fi
    
    # Evaluate health checks
    if [ "$HEALTH_CHECK_PASSED" = true ]; then
        echo -e "${GREEN}✓ All health checks passed${NC}"
        FAILED_CHECKS=0
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        echo -e "${RED}✗ Health check failed (${FAILED_CHECKS}/${FAILED_CHECKS_THRESHOLD})${NC}"
        echo -e "${RED}Reason: ${FAILURE_REASON}${NC}"
        
        # Trigger rollback if threshold exceeded
        if [ "$FAILED_CHECKS" -ge "$FAILED_CHECKS_THRESHOLD" ]; then
            perform_rollback "${FAILURE_REASON}"
        fi
    fi
    
    echo ""
    sleep $CHECK_INTERVAL
done
