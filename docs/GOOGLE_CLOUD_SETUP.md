# Google Cloud Setup Guide for Glide Memory System

This guide walks through setting up Glide's memory infrastructure on Google Cloud Platform.

## Prerequisites

- Google account
- Credit card (for GCP billing, $300 free credit available)
- `gcloud` CLI installed ([installation guide](https://cloud.google.com/sdk/docs/install))

---

## Phase 1: Initial Setup (15 minutes)

### Step 1: Create Google Cloud Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Sign in with your Google account
3. Accept terms of service
4. **Claim $300 free credit** (valid for 90 days)

### Step 2: Create Project

```bash
# Set your project ID (must be globally unique)
export PROJECT_ID="glide-memory-prod"
export PROJECT_NAME="Glide Memory System"
export REGION="us-central1"

# Create project
gcloud projects create $PROJECT_ID \
    --name="$PROJECT_NAME" \
    --set-as-default

# Set billing account (replace with your billing account ID)
# Find your billing account: gcloud billing accounts list
export BILLING_ACCOUNT_ID="YOUR-BILLING-ACCOUNT-ID"
gcloud billing projects link $PROJECT_ID \
    --billing-account=$BILLING_ACCOUNT_ID
```

### Step 3: Enable Required APIs

```bash
# Enable all necessary Google Cloud APIs
gcloud services enable \
    sqladmin.googleapis.com \
    run.googleapis.com \
    storage.googleapis.com \
    compute.googleapis.com \
    servicenetworking.googleapis.com \
    aiplatform.googleapis.com \
    secretmanager.googleapis.com \
    cloudresourcemanager.googleapis.com
```

### Step 4: Set Up Gemini API Access

**Option A: Google AI Studio (Easiest for development)**

1. Go to [Google AI Studio](https://ai.google.dev/aistudio)
2. Click "Get API Key"
3. Select your project: `glide-memory-prod`
4. Copy the API key (starts with `AIza...`)

```bash
# Save API key
export GEMINI_API_KEY="AIzaSy..."
gcloud secrets create gemini-api-key --data-file=- <<< "$GEMINI_API_KEY"
```

**Option B: Vertex AI (Production, better security)**

```bash
# Enable Vertex AI
gcloud services enable aiplatform.googleapis.com

# Create service account for Vertex AI
gcloud iam service-accounts create glide-vertex-ai \
    --display-name="Glide Vertex AI Service Account"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:glide-vertex-ai@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"
```

---

## Phase 2: Database Setup (20 minutes)

### Step 5: Create Cloud SQL PostgreSQL Instance

```bash
# Create PostgreSQL instance with pgvector support
gcloud sql instances create glide-postgres \
    --database-version=POSTGRES_15 \
    --tier=db-custom-4-16384 \
    --region=$REGION \
    --network=default \
    --no-assign-ip \
    --database-flags=cloudsql.enable_pgvector=on \
    --backup-start-time=03:00 \
    --availability-type=zonal

# Set root password
export DB_PASSWORD=$(openssl rand -base64 32)
gcloud sql users set-password postgres \
    --instance=glide-postgres \
    --password=$DB_PASSWORD

# Store password in Secret Manager
gcloud secrets create db-password --data-file=- <<< "$DB_PASSWORD"

# Create database
gcloud sql databases create glide_db \
    --instance=glide-postgres
```

### Step 6: Enable pgvector Extension

```bash
# Connect to Cloud SQL instance
gcloud sql connect glide-postgres --user=postgres --database=glide_db

# In psql prompt, run:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

# Verify installation
SELECT * FROM pg_extension WHERE extname IN ('vector', 'pg_trgm');

# Exit psql
\q
```

### Step 7: Get Database Connection String

```bash
# Get connection name
gcloud sql instances describe glide-postgres \
    --format='value(connectionName)'

# Output example: glide-memory-prod:us-central1:glide-postgres
# Store this for later use
export DB_CONNECTION_NAME=$(gcloud sql instances describe glide-postgres --format='value(connectionName)')

# Full connection string for app
export DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@/glide_db?host=/cloudsql/${DB_CONNECTION_NAME}"
```

---

## Phase 3: Storage Setup (10 minutes)

### Step 8: Create Cloud Storage Bucket

```bash
# Create bucket for audio files
export BUCKET_NAME="${PROJECT_ID}-audio-files"

gsutil mb -l $REGION gs://$BUCKET_NAME

# Enable versioning
gsutil versioning set on gs://$BUCKET_NAME

# Set lifecycle policy (delete files older than 1 year)
cat > lifecycle.json << EOF
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

gsutil lifecycle set lifecycle.json gs://$BUCKET_NAME

# Set CORS for audio upload from frontend
cat > cors.json << EOF
[
  {
    "origin": ["https://yourdomain.com", "http://localhost:*"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://$BUCKET_NAME
```

---

## Phase 4: Backend Deployment (30 minutes)

### Step 9: Prepare Backend for Cloud Run

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Run migrations and start server
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Update `backend/requirements.txt` to include:

```txt
# Add to existing requirements
google-cloud-aiplatform==1.45.0
google-generativeai==0.5.0
google-cloud-storage==2.14.0
google-cloud-secret-manager==2.18.0
psycopg2-binary==2.9.9
pgvector==0.2.5
```

### Step 10: Deploy to Cloud Run

```bash
cd backend

# Build and deploy
gcloud run deploy glide-backend \
    --source . \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --min-instances=1 \
    --max-instances=10 \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --set-env-vars="PROJECT_ID=${PROJECT_ID}" \
    --set-cloudsql-instances=$DB_CONNECTION_NAME \
    --set-secrets="DATABASE_URL=db-password:latest,GEMINI_API_KEY=gemini-api-key:latest" \
    --service-account=glide-vertex-ai@${PROJECT_ID}.iam.gserviceaccount.com

# Get service URL
export BACKEND_URL=$(gcloud run services describe glide-backend \
    --region=$REGION \
    --format='value(status.url)')

echo "Backend deployed at: $BACKEND_URL"
```

---

## Phase 5: Integration & Testing (15 minutes)

### Step 11: Test Gemini API Connection

Create `backend/test_gemini.py`:

```python
import os
import google.generativeai as genai

# Configure Gemini API
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

# Test synthesis
model = genai.GenerativeModel("gemini-2.0-flash-exp")
response = model.generate_content("Synthesize this into a note: Met with Sarah about Q1 dashboard")

print("✅ Gemini API working!")
print(f"Response: {response.text}")

# Test embeddings
embedding_model = genai.GenerativeModel("text-embedding-004")
result = embedding_model.embed_content("Test embedding")

print(f"✅ Embeddings working! Dimension: {len(result['embedding'])}")
```

Run test:

```bash
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key)
python test_gemini.py
```

### Step 12: Test Database Connection

```bash
# Test from Cloud Run
gcloud run services proxy glide-backend --port=8080

# In another terminal, test endpoint
curl http://localhost:8080/api/v1/health
```

---

## Phase 6: Environment Configuration

### Step 13: Set Up All Environment Variables

Create `backend/.env.production`:

```bash
# Project
PROJECT_ID=glide-memory-prod
ENVIRONMENT=production

# Database (handled by Cloud Run secrets)
# DATABASE_URL is injected from Secret Manager

# Google AI
GEMINI_API_KEY=<from-secret-manager>
GEMINI_MODEL=gemini-2.0-flash-exp
EMBEDDING_MODEL=text-embedding-004

# Storage
STORAGE_BUCKET=glide-memory-prod-audio-files

# API
SECRET_KEY=<generate-with-openssl-rand-hex-64>
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Features
ENABLE_MEMORY_EXTRACTION=true
ENABLE_FACT_DEDUPLICATION=true
MEMORY_CONSOLIDATION_SCHEDULE=0 3 * * *  # 3 AM daily
```

Store secrets:

```bash
# Generate and store secret key
openssl rand -hex 64 | gcloud secrets create secret-key --data-file=-

# Update Cloud Run with all secrets
gcloud run services update glide-backend \
    --region=$REGION \
    --set-secrets="DATABASE_URL=db-password:latest,GEMINI_API_KEY=gemini-api-key:latest,SECRET_KEY=secret-key:latest" \
    --set-env-vars="STORAGE_BUCKET=${BUCKET_NAME},PROJECT_ID=${PROJECT_ID},GEMINI_MODEL=gemini-2.0-flash-exp"
```

---

## Phase 7: Monitoring & Optimization

### Step 14: Set Up Logging

```bash
# View logs
gcloud run services logs read glide-backend \
    --region=$REGION \
    --limit=50

# Create log-based metric for errors
gcloud logging metrics create gemini_api_errors \
    --description="Count of Gemini API errors" \
    --log-filter='resource.type="cloud_run_revision"
        AND severity="ERROR"
        AND textPayload=~"Gemini"'
```

### Step 15: Set Up Alerts

```bash
# Create alert for high error rate
gcloud alpha monitoring policies create \
    --notification-channels=YOUR_CHANNEL_ID \
    --display-name="Glide High Error Rate" \
    --condition-display-name="Error rate > 5%" \
    --condition-threshold-value=0.05 \
    --condition-threshold-duration=300s
```

---

## Cost Optimization Tips

### 1. Use Preemptible Cloud SQL (Dev/Staging)

```bash
# For non-production environments
gcloud sql instances create glide-postgres-dev \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --edition=ENTERPRISE  # Required for pgvector
```

### 2. Enable Cloud Run Autoscaling

Already configured with `--min-instances=1 --max-instances=10`

Scale to zero for dev:
```bash
gcloud run services update glide-backend-dev \
    --min-instances=0 \
    --max-instances=3
```

### 3. Use Flash-Lite for Simple Tasks

In your code, route simple tasks to cheaper model:

```python
def get_model_for_task(complexity: str):
    if complexity == "simple":
        return "gemini-2.5-flash-lite"
    elif complexity == "medium":
        return "gemini-2.0-flash-exp"
    else:
        return "gemini-2.5-pro"
```

### 4. Enable Prompt Caching

```python
from google.generativeai import caching

# Cache system prompt (75% discount on cached tokens)
cache = caching.CachedContent.create(
    model="gemini-2.0-flash-exp",
    system_instruction=SYNTHESIS_SYSTEM_PROMPT,
    ttl=datetime.timedelta(hours=1)
)

model = genai.GenerativeModel.from_cached_content(cache)
```

---

## Quick Reference: Estimated Costs (1,000 users)

| Resource | Config | Monthly Cost |
|----------|--------|--------------|
| Gemini API (Flash) | 78M input + 60M output | $173 |
| Embeddings | Text Embeddings 004 | **$0** |
| Cloud SQL | db-custom-4-16384 | $280 |
| Cloud Run | 2 vCPU, 2Gi RAM | $80 |
| Cloud Storage | 1TB + requests | $20 |
| Networking | Egress + LB | $50 |
| **TOTAL** | | **$603/month** |

---

## Next Steps

1. ✅ Complete this setup
2. Run database migrations: `alembic upgrade head`
3. Deploy frontend with updated API endpoint
4. Test end-to-end flow
5. Enable monitoring and alerts
6. Set up CI/CD with Cloud Build

---

## Troubleshooting

### "pgvector extension not found"

```sql
-- Enable in Cloud SQL flags
gcloud sql instances patch glide-postgres \
    --database-flags=cloudsql.enable_pgvector=on

-- Restart instance
gcloud sql instances restart glide-postgres
```

### "Gemini API quota exceeded"

Check quota:
```bash
gcloud services quota list --service=generativelanguage.googleapis.com
```

Request increase:
```bash
gcloud services quota update \
    --service=generativelanguage.googleapis.com \
    --consumer=projects/$PROJECT_ID \
    --metric=generativelanguage.googleapis.com/requests_per_minute \
    --value=1000
```

### "Cloud Run deployment fails"

Check logs:
```bash
gcloud builds log --stream
```

Common issues:
- Missing `PORT` env var → Cloud Run injects this automatically
- Database connection → Ensure Cloud SQL connector is configured
- Secrets not found → Verify Secret Manager permissions

---

## Support & Resources

- [Google Cloud Console](https://console.cloud.google.com)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
- [Cost Calculator](https://cloud.google.com/products/calculator)
