#!/bin/bash
set -e

# Deploy ECS Service Script
# Usage: ./deploy-service.sh <environment> <task-definition-arn>

ENVIRONMENT=${1:-ci}
TASK_DEFINITION_ARN=${2}
SERVICE_NAME="complex-payment-service-${ENVIRONMENT}"

# Only add -1 suffix for CI environment
if [ "$ENVIRONMENT" = "ci" ]; then
  SERVICE_NAME="complex-payment-service-${ENVIRONMENT}"
fi

CLUSTER_NAME="complex-cluster-${ENVIRONMENT}"
SERVICE_DEF_FILE="ecs/${ENVIRONMENT}/service-definition.json"

if [ -z "$TASK_DEFINITION_ARN" ]; then
  echo "❌ Error: Task definition ARN is required"
  echo "Usage: $0 <environment> <task-definition-arn>"
  exit 1
fi

echo "🚀 Deploying ECS service: $SERVICE_NAME"
echo "📋 Environment: $ENVIRONMENT"
echo "🎯 Task Definition: $TASK_DEFINITION_ARN"

# Check if service definition file exists
if [ ! -f "$SERVICE_DEF_FILE" ]; then
  echo "❌ Error: Service definition file not found: $SERVICE_DEF_FILE"
  exit 1
fi

# Check if service exists (including services with suffixes like -1, -2, etc.)
echo "🔍 Checking if ECS service exists..."
echo "   Looking for service: $SERVICE_NAME (or with suffix -1, -2, etc.)"

# List all services and filter for exact match or suffix match
MATCHING_SERVICES=$(aws ecs list-services \
  --cluster "$CLUSTER_NAME" \
  --output json | \
  jq -r '.serviceArns[]' | \
  awk -F'/' '{print $NF}' | \
  grep -E "^${SERVICE_NAME}(-[0-9]+)?$" || true)

if [ -z "$MATCHING_SERVICES" ]; then
  echo "   No existing service found"
  SERVICE_EXISTS="NONE"
else
  echo "   Found existing service(s): $MATCHING_SERVICES"
  # Use the first matching service (should only be one)
  EXISTING_SERVICE=$(echo "$MATCHING_SERVICES" | head -n 1)
  echo "   Will update: $EXISTING_SERVICE"
  SERVICE_NAME="$EXISTING_SERVICE"
  SERVICE_EXISTS="ACTIVE"
fi

# Update service definition with new task definition
echo "📝 Updating service definition with task definition..."
UPDATED_SERVICE_DEF="${SERVICE_DEF_FILE%.json}-updated.json"

jq --arg task_def "$TASK_DEFINITION_ARN" \
  '.taskDefinition = $task_def' \
  "$SERVICE_DEF_FILE" >"$UPDATED_SERVICE_DEF"

echo "✅ Service definition updated: $UPDATED_SERVICE_DEF"

if [ "$SERVICE_EXISTS" = "NONE" ]; then
  echo "🆕 Service does not exist. Creating new service..."

  aws ecs create-service \
    --cli-input-json "file://$UPDATED_SERVICE_DEF" \
    --no-cli-pager

  echo "✅ Service created successfully"
else
  echo "🔄 Service exists. Applying full service update..."

  # Extract configuration from service definition for update
  DESIRED_COUNT=$(jq -r '.desiredCount' "$SERVICE_DEF_FILE")
  NETWORK_CONFIG=$(jq -c '.networkConfiguration' "$SERVICE_DEF_FILE")
  DEPLOYMENT_CONFIG=$(jq -c '.deploymentConfiguration' "$SERVICE_DEF_FILE")

  # Apply comprehensive service update
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --desired-count "$DESIRED_COUNT" \
    --network-configuration "$NETWORK_CONFIG" \
    --deployment-configuration "$DEPLOYMENT_CONFIG" \
    --force-new-deployment \
    --no-cli-pager

  echo "✅ Service updated successfully with all configurations"
fi

echo "⏳ Waiting for deployment to stabilize..."
aws ecs wait services-stable \
  --cluster "$CLUSTER_NAME" \
  --services "$SERVICE_NAME"

echo "🎉 Deployment completed successfully!"

# Cleanup temporary file
rm -f "$UPDATED_SERVICE_DEF"

