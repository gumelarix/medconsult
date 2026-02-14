# Railway Deployment Guide - MedConsult Backend

## Overview
This guide covers deploying the MedConsult FastAPI backend to Railway.app.

## Prerequisites
- Railway account (https://railway.app)
- Railway CLI installed (`npm install -g @railway/cli`)
- Git repository with your code
- Docker (for local testing)

## Files Created for Railway Deployment

### 1. **railway.json**
Configuration file that tells Railway how to build and deploy your application.

### 2. **Dockerfile**
Docker container configuration for production deployment:
- Python 3.11 slim base image
- Installs dependencies from requirements.txt
- Includes health check endpoint
- Runs with uvicorn on port 8000

### 3. **.dockerignore**
Excludes unnecessary files from Docker builds to reduce image size.

### 4. **.railway** (optional)
Railway CLI configuration for local deployments.

## Deployment Steps

### Option 1: Using Railway Dashboard (Easiest)

1. **Login to Railway**
   - Go to https://railway.app/dashboard
   - Sign in with your GitHub/GitLab/Email account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub"
   - Connect your GitHub repository
   - Select the `medconsult` repository

3. **Configure Environment Variables**
   - Go to project settings
   - Add the following variables:
     ```
     MONGO_URL=<your-mongodb-connection-string>
     DB_NAME=medconsult
     JWT_SECRET=<generate-a-secure-random-string>
     CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
     ```

4. **Configure Build Settings**
   - Railway should auto-detect the Dockerfile
   - Set the root directory to `/backend`
   - Configure the deployment branch (usually `main`)

5. **Deploy**
   - Click "Deploy"
   - Monitor the build logs
   - Once deployed, you'll get a public URL

### Option 2: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Navigate to backend directory
cd backend

# Initialize Railway project
railway init

# Link to existing project (if already created in dashboard)
railway link

# Set environment variables
railway variable set MONGO_URL=<your-connection-string>
railway variable set DB_NAME=medconsult
railway variable set JWT_SECRET=<your-secret>
railway variable set CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Deploy
railway up
```

### Option 3: Using Git Push (Automatic Deployment)

If you connect a GitHub repository to Railway:
1. Commit your changes
2. Push to main branch
3. Railway automatically detects changes and redeploys

```bash
git add .
git commit -m "Add Railway deployment configuration"
git push origin main
```

## Environment Variables Setup

Create a `.env` file in the backend directory with these variables:

```env
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=medconsult
JWT_SECRET=generate-a-strong-random-string-here
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
PORT=8000
HOST=0.0.0.0
```

**Important:** Never commit `.env` to Git. Use Railway's environment variable management instead.

## Connecting MongoDB

1. **Create MongoDB Atlas account** (if you don't have one):
   - Go to https://www.mongodb.com/cloud/atlas
   - Create a free cluster

2. **Get Connection String**:
   - In MongoDB Atlas dashboard
   - Click "Connect"
   - Choose "Drivers"
   - Copy the connection string
   - Replace `<username>` and `<password>` with your credentials

3. **Add to Railway**:
   - Go to Railway project settings
   - Add MONGO_URL variable with your connection string

## Testing Deployment Locally

```bash
# Build Docker image
docker build -t medconsult-backend .

# Run container locally
docker run -p 8000:8000 \
  -e MONGO_URL=<your-connection-string> \
  -e DB_NAME=medconsult \
  -e JWT_SECRET=test-secret \
  medconsult-backend

# Test health endpoint
curl http://localhost:8000/api/health
```

## Production Checklist

- [ ] Set strong JWT_SECRET (use `openssl rand -base64 32`)
- [ ] Configure CORS_ORIGINS with your frontend domain
- [ ] Set up MongoDB production cluster
- [ ] Enable Database encryption in MongoDB
- [ ] Configure monitoring and logs in Railway
- [ ] Set up automated backups for MongoDB
- [ ] Test all API endpoints post-deployment
- [ ] Configure custom domain (optional)
- [ ] Set up email alerts for deployment failures

## Monitoring and Logs

In Railway Dashboard:
1. Go to your project
2. Click "Logs" tab to view deployment logs
3. Click "Metrics" to monitor resource usage
4. Set up alerts for deployment failures

## Troubleshooting

### Port binding errors
- Railway automatically assigns a PORT environment variable
- Ensure your server uses `$PORT` from environment

### MongoDB connection failures
- Verify MONGO_URL is correct
- Check IP whitelist in MongoDB Atlas (add 0.0.0.0/0 for Railway)
- Test connection string locally

### Build failures
- Check Docker build logs
- Ensure all dependencies are in requirements.txt
- Verify Dockerfile syntax

### Health check failures
- Ensure `/api/health` endpoint is accessible
- Check if server is binding to correct host/port

## Custom Domain Setup

1. In Railway project settings
2. Go to "Domain"
3. Click "Generate Domain" or add custom domain
4. Update CORS_ORIGINS with your domain

## Scaling and Performance

- Railway provides horizontal scaling
- For higher traffic, upgrade to paid plans
- Monitor CPU and memory usage
- Consider caching strategies
- Optimize database queries

## Cost Optimization

- Use Railway's free tier for development
- Scale only when needed
- Archive old logs
- Monitor resource usage
- Consolidate databases

## Useful Links

- Railway Docs: https://docs.railway.app
- FastAPI Deployment: https://fastapi.tiangolo.com/deployment/
- MongoDB Atlas: https://www.mongodb.com/cloud/atlas
- Railway Pricing: https://railway.app/pricing

## Next Steps

1. Commit all Railway configuration files
2. Set up MongoDB connection
3. Configure environment variables
4. Deploy via Railway Dashboard or CLI
5. Test all endpoints
6. Set up custom domain
7. Configure monitoring and alerts
