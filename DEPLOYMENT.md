# Deployment Guide - Railway

This document provides step-by-step instructions for deploying the MedConsult application to Railway.

## Prerequisites

- Railway account (https://railway.app)
- Git repository connected to Railway
- MongoDB Atlas account (or MongoDB service on Railway)
- Environment variables configured

## What's Included

This repository has been prepared with the following deployment files:

- **Dockerfile** - Container configuration for the backend application
- **Procfile** - Process types for Railway
- **railway.json** - Railway-specific configuration
- **.env.example** - Template for required environment variables

## Deployment Steps

### 1. Prepare Environment Variables

Copy `.env.example` to create your environment variables:

```bash
cp .env.example .env
```

Update the following values:
- `MONGO_URL`: Your MongoDB Atlas connection string
- `DB_NAME`: Your database name (e.g., `medconsult`)
- `JWT_SECRET`: A strong secret key for JWT token signing
- `CORS_ORIGINS`: Comma-separated list of allowed origins

### 2. Configure MongoDB

1. Create a MongoDB Atlas cluster if you don't have one
2. Get your connection string from Atlas dashboard
3. Add it to your environment variables as `MONGO_URL`

Example: `mongodb+srv://user:password@cluster.mongodb.net/medconsult?retryWrites=true&w=majority`

### 3. Deploy to Railway

#### Option A: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Add your environment variables
railway variables set MONGO_URL="your-mongodb-url"
railway variables set DB_NAME="medconsult"
railway variables set JWT_SECRET="your-secret-key"
railway variables set CORS_ORIGINS="your-domain.com"

# Deploy
railway up
```

#### Option B: Using GitHub Integration

1. Go to https://railway.app/dashboard
2. Click "Create New Project"
3. Select "Deploy from GitHub"
4. Connect your GitHub repository
5. Select the repository branch to deploy
6. Configure environment variables in Railway dashboard:
   - Go to Project Settings
   - Add variables from `.env.example`
7. Railway will automatically deploy on push to the configured branch

### 4. Configure Environment Variables in Railway

In the Railway dashboard:

1. Go to your project
2. Click on the service
3. Go to "Variables" tab
4. Add all required variables from `.env.example`:
   - `MONGO_URL`
   - `DB_NAME`
   - `JWT_SECRET`
   - `CORS_ORIGINS`

### 5. Set Up MongoDB on Railway (Optional)

If you prefer to use MongoDB through Railway:

1. In your Railway project, click "Add a Plugin"
2. Select "MongoDB"
3. Confirm and add it
4. The `MONGO_URL` will be automatically set in your environment

### 6. Verify Deployment

Once deployed, verify your application:

1. Check Railway logs for any errors
2. Test the health endpoint:
   ```bash
   curl https://your-railway-domain.railway.app/health
   ```

3. Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2025-02-11T12:00:00.000000+00:00"
   }
   ```

## Architecture

The deployment is configured as follows:

- **Backend**: FastAPI application running with Uvicorn
- **Port**: Automatically assigned by Railway (accessible via environment variable)
- **Database**: MongoDB Atlas or Railway MongoDB plugin
- **WebSockets**: Enabled via Socket.IO integration

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb+srv://...` |
| `DB_NAME` | Database name | `medconsult` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secret-key` |
| `CORS_ORIGINS` | Allowed CORS origins | `https://yourdomain.com` |
| `PORT` | Server port (set by Railway) | `8000` |

## Monitoring & Logs

View logs in Railway dashboard:

1. Go to your project
2. Click on the service
3. Click "Logs" tab
4. View real-time application logs

## Troubleshooting

### MongoDB Connection Issues
- Verify connection string format
- Check IP whitelist in MongoDB Atlas
- Ensure credentials are correct

### Port Issues
- Railway automatically assigns `$PORT` environment variable
- The Procfile and Dockerfile both use this variable
- No manual port configuration needed

### CORS Errors
- Check `CORS_ORIGINS` environment variable
- Ensure frontend domain is included in the comma-separated list
- Update after deployment if frontend domain changes

### Health Check Failures
- Check application logs in Railway dashboard
- Verify `/health` endpoint is accessible
- Ensure MongoDB connection is working

## Next Steps

### 1. Connect Frontend (Future)
When you're ready to deploy the frontend:
- Build the React app
- Update `CORS_ORIGINS` to include your frontend domain
- Deploy frontend separately or integrate into same service

### 2. Set Up Monitoring
- Enable Railway notifications
- Set up error tracking (e.g., Sentry)
- Monitor application performance

### 3. Database Backups
- Configure MongoDB Atlas backups
- Set up automated backup schedules
- Document backup/restore procedures

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [MongoDB Atlas Connection Guide](https://www.mongodb.com/docs/atlas/connect/)
- [Socket.IO Deployment](https://socket.io/docs/v4/socket-io-on-prod/)

## Support

For issues or questions:
1. Check Railway documentation
2. Review application logs in Railway dashboard
3. Verify all environment variables are set correctly
4. Test locally before deploying changes

---

**Last Updated**: February 2025
