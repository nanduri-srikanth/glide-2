# Glide on Google Cloud - Quick Start (15 minutes)

Get Glide's memory system running on Google Cloud in 3 simple steps.

## Prerequisites

1. **Google Account** (get $300 free credit)
2. **gcloud CLI** - Install from [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
3. **Gemini API Key** - Get from [Google AI Studio](https://ai.google.dev/aistudio)

---

## Step 1: Run Automated Setup (10 mins)

```bash
# Run the setup script
./scripts/setup-google-cloud.sh
```

This will:
- ✅ Create GCP project
- ✅ Enable required APIs (Gemini, Cloud SQL, Cloud Run)
- ✅ Set up PostgreSQL with pgvector
- ✅ Create Cloud Storage bucket
- ✅ Configure secrets and permissions

**What you'll need:**
- Choose a unique project ID (e.g., `glide-prod-abc123`)
- Your Gemini API key (from AI Studio)

---

## Step 2: Enable pgvector (2 mins)

```bash
# Connect to Cloud SQL
gcloud sql connect glide-postgres-prod --user=postgres --database=glide_db

# In the psql prompt, run:
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
\dx  # Verify extensions
\q   # Exit
```

---

## Step 3: Deploy Backend (3 mins)

```bash
# Deploy to Cloud Run
./scripts/deploy-backend.sh
```

This will:
- ✅ Build Docker container
- ✅ Deploy to Cloud Run
- ✅ Run database migrations
- ✅ Connect to Cloud SQL and Gemini API

---

## Verify Deployment

```bash
# Test health endpoint
source glide-gcp-config.env
curl $BACKEND_URL/api/v1/health

# Expected response:
# {"status": "healthy", "database": "connected", "gemini": "ready"}
```

---

## Update Frontend

Update your `.env.local`:

```bash
EXPO_PUBLIC_API_URL=<your-backend-url>
```

---

## 🎉 You're Done!

Your Glide memory system is now running on Google Cloud with:

- **Gemini 2.0 Flash** for AI synthesis
- **Free embeddings** (Text Embeddings 004)
- **PostgreSQL with pgvector** for memory storage
- **Cloud Run** auto-scaling backend
- **~$600/month** for 1,000 users

---

## Next Steps

### Monitor Your Deployment

```bash
# View logs
gcloud run services logs read glide-backend-prod --region=us-central1 --tail

# Check costs
gcloud billing accounts list
gcloud billing projects describe $(gcloud config get-value project)
```

### Optimize Costs

1. **Use Flash-Lite for simple tasks** (70% cheaper)
2. **Enable prompt caching** (75% discount on cached tokens)
3. **Scale to zero in dev** (`--min-instances=0`)

See [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md) for details.

### Set Up CI/CD

```bash
# Deploy from GitHub on every push
gcloud builds submit --config=cloudbuild.yaml
```

---

## Troubleshooting

### "Permission denied"

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### "pgvector extension not found"

```bash
# Verify flag is enabled
gcloud sql instances describe glide-postgres-prod --format='value(settings.databaseFlags)'

# If not enabled:
gcloud sql instances patch glide-postgres-prod \
    --database-flags=cloudsql.enable_pgvector=on

# Restart
gcloud sql instances restart glide-postgres-prod
```

### "Deployment failed"

```bash
# Check build logs
gcloud builds log --stream

# Common issues:
# - Missing requirements.txt dependencies
# - Database connection timeout
# - Secret not found in Secret Manager
```

---

## Cost Breakdown (1,000 users/month)

| Service | Cost |
|---------|------|
| Gemini 2.0 Flash API | $173 |
| Text Embeddings (FREE) | $0 |
| Cloud SQL PostgreSQL | $280 |
| Cloud Run | $80 |
| Cloud Storage | $20 |
| Networking | $50 |
| **Total** | **$603** |

**Per user: $0.60/month**

Compare to AWS: $5,949/month (89% savings!)

---

## Resources

- 📖 [Full Setup Guide](./GOOGLE_CLOUD_SETUP.md)
- 🔧 [Configuration Reference](../glide-gcp-config.env)
- 📊 [GCP Console](https://console.cloud.google.com)
- 💰 [Cost Calculator](https://cloud.google.com/products/calculator)
- 🤖 [Gemini API Docs](https://ai.google.dev/docs)

---

## Support

Issues? Check:
1. [GCP Status Dashboard](https://status.cloud.google.com)
2. [Gemini API Status](https://status.ai.google.dev)
3. Logs: `gcloud run services logs read glide-backend-prod`

Need help? Open an issue or check the detailed setup guide.
