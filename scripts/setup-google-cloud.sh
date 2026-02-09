#!/bin/bash
# Google Cloud Setup Script for Glide Memory System
# This script automates the initial GCP infrastructure setup

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Glide Memory System - GCP Setup          ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Interactive configuration
echo -e "${YELLOW}📝 Configuration${NC}"
read -p "Project ID (must be globally unique): " PROJECT_ID
read -p "Project Name [Glide Memory System]: " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-"Glide Memory System"}
read -p "Region [us-central1]: " REGION
REGION=${REGION:-"us-central1"}
read -p "Environment (dev/staging/prod) [prod]: " ENVIRONMENT
ENVIRONMENT=${ENVIRONMENT:-"prod"}

echo ""
echo -e "${GREEN}✓${NC} Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Project Name: $PROJECT_NAME"
echo "  Region: $REGION"
echo "  Environment: $ENVIRONMENT"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Step 1: Create project
echo -e "\n${YELLOW}[1/10] Creating GCP project...${NC}"
if gcloud projects describe $PROJECT_ID &> /dev/null; then
    echo -e "${GREEN}✓${NC} Project already exists"
else
    gcloud projects create $PROJECT_ID --name="$PROJECT_NAME" --set-as-default
    echo -e "${GREEN}✓${NC} Project created"
fi

gcloud config set project $PROJECT_ID

# Step 2: Enable billing
echo -e "\n${YELLOW}[2/10] Setting up billing...${NC}"
BILLING_ACCOUNTS=$(gcloud billing accounts list --format="value(name)" --limit=1)
if [ -z "$BILLING_ACCOUNTS" ]; then
    echo -e "${RED}❌ No billing account found${NC}"
    echo "Please set up billing at: https://console.cloud.google.com/billing"
    exit 1
fi

BILLING_ACCOUNT=$(echo $BILLING_ACCOUNTS | head -n 1)
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT
echo -e "${GREEN}✓${NC} Billing linked: $BILLING_ACCOUNT"

# Step 3: Enable APIs
echo -e "\n${YELLOW}[3/10] Enabling required APIs...${NC}"
gcloud services enable \
    sqladmin.googleapis.com \
    run.googleapis.com \
    storage.googleapis.com \
    compute.googleapis.com \
    servicenetworking.googleapis.com \
    aiplatform.googleapis.com \
    secretmanager.googleapis.com \
    cloudresourcemanager.googleapis.com \
    cloudbuild.googleapis.com

echo -e "${GREEN}✓${NC} APIs enabled"

# Step 4: Set up Gemini API
echo -e "\n${YELLOW}[4/10] Setting up Gemini API...${NC}"
echo "Please obtain a Gemini API key from: https://ai.google.dev/aistudio"
read -p "Enter your Gemini API key: " -s GEMINI_API_KEY
echo

if [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${RED}❌ API key required${NC}"
    exit 1
fi

# Store in Secret Manager
echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
    --data-file=- \
    --replication-policy="automatic" || \
    echo -n "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-

echo -e "${GREEN}✓${NC} Gemini API key stored in Secret Manager"

# Step 5: Create Cloud SQL instance
echo -e "\n${YELLOW}[5/10] Creating Cloud SQL PostgreSQL instance...${NC}"
echo "This may take 5-10 minutes..."

DB_INSTANCE_NAME="glide-postgres-${ENVIRONMENT}"
DB_TIER="db-custom-4-16384"

if [ "$ENVIRONMENT" == "dev" ]; then
    DB_TIER="db-f1-micro"
fi

if gcloud sql instances describe $DB_INSTANCE_NAME &> /dev/null; then
    echo -e "${GREEN}✓${NC} Database instance already exists"
else
    gcloud sql instances create $DB_INSTANCE_NAME \
        --database-version=POSTGRES_15 \
        --tier=$DB_TIER \
        --region=$REGION \
        --network=default \
        --database-flags=cloudsql.enable_pgvector=on \
        --backup-start-time=03:00 \
        --availability-type=zonal \
        --storage-auto-increase

    echo -e "${GREEN}✓${NC} Database instance created"
fi

# Set database password
DB_PASSWORD=$(openssl rand -base64 32)
gcloud sql users set-password postgres \
    --instance=$DB_INSTANCE_NAME \
    --password="$DB_PASSWORD"

# Store password in Secret Manager
echo -n "$DB_PASSWORD" | gcloud secrets create db-password \
    --data-file=- \
    --replication-policy="automatic" || \
    echo -n "$DB_PASSWORD" | gcloud secrets versions add db-password --data-file=-

echo -e "${GREEN}✓${NC} Database password set and stored"

# Create database
gcloud sql databases create glide_db \
    --instance=$DB_INSTANCE_NAME || echo "Database already exists"

# Step 6: Enable pgvector
echo -e "\n${YELLOW}[6/10] Enabling pgvector extension...${NC}"
DB_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME --format='value(connectionName)')

# Create temporary connection script
cat > /tmp/enable_pgvector.sql << EOF
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\dx
EOF

# Connect and enable extensions (requires Cloud SQL Proxy or gcloud sql connect)
echo "Run the following command to enable pgvector:"
echo "  gcloud sql connect $DB_INSTANCE_NAME --user=postgres --database=glide_db < /tmp/enable_pgvector.sql"
echo ""
read -p "Press enter when done..."

# Step 7: Create Cloud Storage bucket
echo -e "\n${YELLOW}[7/10] Creating Cloud Storage bucket...${NC}"
BUCKET_NAME="${PROJECT_ID}-audio-files"

if gsutil ls gs://$BUCKET_NAME &> /dev/null; then
    echo -e "${GREEN}✓${NC} Bucket already exists"
else
    gsutil mb -l $REGION gs://$BUCKET_NAME
    gsutil versioning set on gs://$BUCKET_NAME

    # Set lifecycle policy
    cat > /tmp/lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 365}
      }
    ]
  }
}
EOF
    gsutil lifecycle set /tmp/lifecycle.json gs://$BUCKET_NAME

    echo -e "${GREEN}✓${NC} Bucket created: $BUCKET_NAME"
fi

# Step 8: Create service account
echo -e "\n${YELLOW}[8/10] Creating service account...${NC}"
SERVICE_ACCOUNT="glide-backend@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $SERVICE_ACCOUNT &> /dev/null; then
    echo -e "${GREEN}✓${NC} Service account already exists"
else
    gcloud iam service-accounts create glide-backend \
        --display-name="Glide Backend Service Account"

    # Grant permissions
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/cloudsql.client"

    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/storage.objectAdmin"

    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor"

    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/aiplatform.user"

    echo -e "${GREEN}✓${NC} Service account created with permissions"
fi

# Step 9: Generate secret key
echo -e "\n${YELLOW}[9/10] Generating application secret key...${NC}"
SECRET_KEY=$(openssl rand -hex 64)
echo -n "$SECRET_KEY" | gcloud secrets create secret-key \
    --data-file=- \
    --replication-policy="automatic" || \
    echo -n "$SECRET_KEY" | gcloud secrets versions add secret-key --data-file=-

echo -e "${GREEN}✓${NC} Secret key generated and stored"

# Step 10: Create configuration file
echo -e "\n${YELLOW}[10/10] Creating configuration file...${NC}"

cat > glide-gcp-config.env << EOF
# Glide GCP Configuration
# Generated: $(date)

PROJECT_ID=$PROJECT_ID
ENVIRONMENT=$ENVIRONMENT
REGION=$REGION

# Database
DB_INSTANCE_NAME=$DB_INSTANCE_NAME
DB_CONNECTION_NAME=$DB_CONNECTION_NAME
DATABASE_URL=postgresql://postgres:\${DB_PASSWORD}@/glide_db?host=/cloudsql/$DB_CONNECTION_NAME

# Storage
STORAGE_BUCKET=$BUCKET_NAME

# Service Account
SERVICE_ACCOUNT=$SERVICE_ACCOUNT

# Secrets (stored in Secret Manager)
# - gemini-api-key
# - db-password
# - secret-key

# Next steps:
# 1. Deploy backend: gcloud run deploy glide-backend --source ./backend ...
# 2. Run migrations: alembic upgrade head
# 3. Test API: curl \${BACKEND_URL}/api/v1/health
EOF

echo -e "${GREEN}✓${NC} Configuration saved to: glide-gcp-config.env"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup Complete! 🎉                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📋 Summary:${NC}"
echo "  ✓ Project: $PROJECT_ID"
echo "  ✓ Database: $DB_INSTANCE_NAME"
echo "  ✓ Storage: $BUCKET_NAME"
echo "  ✓ Region: $REGION"
echo ""
echo -e "${YELLOW}🔐 Secrets stored in Secret Manager:${NC}"
echo "  - gemini-api-key"
echo "  - db-password"
echo "  - secret-key"
echo ""
echo -e "${YELLOW}📁 Configuration saved:${NC}"
echo "  - glide-gcp-config.env"
echo ""
echo -e "${YELLOW}🚀 Next steps:${NC}"
echo "  1. Review: cat glide-gcp-config.env"
echo "  2. Enable pgvector: gcloud sql connect $DB_INSTANCE_NAME --user=postgres --database=glide_db"
echo "     Then run: CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;"
echo "  3. Deploy backend: ./scripts/deploy-backend.sh"
echo "  4. Run migrations: alembic upgrade head"
echo ""
echo -e "${YELLOW}📊 Estimated monthly cost (1,000 users):${NC}"
echo "  - Gemini API: ~\$173"
echo "  - Cloud SQL: ~\$280"
echo "  - Cloud Run: ~\$80"
echo "  - Storage: ~\$20"
echo "  - Total: ~\$603/month"
echo ""
echo -e "${GREEN}View resources: https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID${NC}"
