#!/bin/bash
# Deploy Glide Backend to Google Cloud Run

set -e

# Load configuration
if [ ! -f "glide-gcp-config.env" ]; then
    echo "❌ Configuration file not found. Run setup-google-cloud.sh first."
    exit 1
fi

source glide-gcp-config.env

echo "🚀 Deploying Glide Backend to Cloud Run"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Navigate to backend directory
cd backend

# Deploy to Cloud Run
gcloud run deploy glide-backend-${ENVIRONMENT} \
    --source . \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --min-instances=1 \
    --max-instances=10 \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --set-env-vars="PROJECT_ID=${PROJECT_ID},ENVIRONMENT=${ENVIRONMENT},STORAGE_BUCKET=${STORAGE_BUCKET},GEMINI_MODEL=gemini-2.0-flash-exp,EMBEDDING_MODEL=text-embedding-004" \
    --add-cloudsql-instances=$DB_CONNECTION_NAME \
    --set-secrets="DATABASE_URL=db-password:latest,GEMINI_API_KEY=gemini-api-key:latest,SECRET_KEY=secret-key:latest" \
    --service-account=$SERVICE_ACCOUNT

# Get service URL
BACKEND_URL=$(gcloud run services describe glide-backend-${ENVIRONMENT} \
    --region=$REGION \
    --format='value(status.url)')

echo ""
echo "✅ Deployment successful!"
echo ""
echo "Backend URL: $BACKEND_URL"
echo ""
echo "Test health endpoint:"
echo "  curl $BACKEND_URL/api/v1/health"
echo ""
echo "View logs:"
echo "  gcloud run services logs read glide-backend-${ENVIRONMENT} --region=$REGION"
echo ""

# Save backend URL to config
echo "BACKEND_URL=$BACKEND_URL" >> ../glide-gcp-config.env
