# Railway Deployment Guide - MedConsult Frontend

## Overview
This guide covers deploying the MedConsult React frontend to Railway.app.

## Files Created for Railway Deployment

### 1. **railway.json**
Configuration file that tells Railway how to build and deploy your React application.

### 2. **Dockerfile**
Multi-stage Docker configuration:
- **Stage 1 (Builder)**: Builds the React application with yarn
- **Stage 2 (Production)**: Minimal production image using `serve` to run the built app
- Optimized for production with smallest possible image size
- Includes health checks

### 3. **.dockerignore**
Excludes unnecessary files from Docker builds to reduce image size.

### 4. **.railway** (optional)
Railway CLI configuration for local deployments.

### 5. **.env.example**
Template for environment variables needed by the frontend.

## Prerequisites
- Railway account (https://railway.app)
- Git repository with your code
- Backend deployed to Railway (for API_BASE_URL)

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
     REACT_APP_API_BASE_URL=https://your-backend-railway-url/api
     REACT_APP_API_SOCKET_URL=https://your-backend-railway-url
     REACT_APP_ENV=production
     REACT_APP_LOG_LEVEL=info
     REACT_APP_ENABLE_ANALYTICS=true
     REACT_APP_ENABLE_ERROR_TRACKING=true
     ```

4. **Configure Build Settings**
   - Set the root directory to `/frontend`
   - Railway should auto-detect the Dockerfile
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

# Navigate to frontend directory
cd frontend

# Initialize Railway project
railway init

# Link to existing project (if already created in dashboard)
railway link

# Set environment variables
railway variable set REACT_APP_API_BASE_URL=https://your-backend-url/api
railway variable set REACT_APP_API_SOCKET_URL=https://your-backend-url
railway variable set REACT_APP_ENV=production

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
git commit -m "Add Railway deployment configuration for frontend"
git push origin main
```

## Environment Variables

Create a `.env.production` file in the frontend directory:

```env
REACT_APP_API_BASE_URL=https://your-backend-railway-url/api
REACT_APP_API_SOCKET_URL=https://your-backend-railway-url
REACT_APP_ENV=production
REACT_APP_LOG_LEVEL=info
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_ERROR_TRACKING=true
```

**Important:** Never commit `.env` files to Git. Use Railway's environment variable management instead.

## Testing Deployment Locally

```bash
# Build the application
cd frontend
yarn install
yarn build

# Test with Docker locally
docker build -t medconsult-frontend .

# Run container locally
docker run -p 3000:3000 \
  -e REACT_APP_API_BASE_URL=http://localhost:8000/api \
  -e REACT_APP_API_SOCKET_URL=http://localhost:8000 \
  medconsult-frontend

# Access at http://localhost:3000
```

## Connecting to Backend

Make sure your frontend environment variables point to your deployed backend:

1. **Get your backend Railway URL** from the backend deployment
2. **Update REACT_APP_API_BASE_URL** to point to your backend API
3. **Update REACT_APP_API_SOCKET_URL** to point to your backend Socket.IO server

Example:
```
REACT_APP_API_BASE_URL=https://medconsult-backend-xyz123.railway.app/api
REACT_APP_API_SOCKET_URL=https://medconsult-backend-xyz123.railway.app
```

## Production Checklist

- [ ] Backend is deployed to Railway
- [ ] Backend URL is configured in frontend environment variables
- [ ] All API endpoints are accessible from the frontend
- [ ] Socket.IO connection is working
- [ ] Authentication flows are tested
- [ ] Enable CORS for frontend domain in backend
- [ ] Set up custom domain (optional)
- [ ] Configure monitoring in Railway
- [ ] Test all features end-to-end
- [ ] Set up error tracking/logging

## Monitoring and Logs

In Railway Dashboard:
1. Go to your project
2. Click "Logs" tab to view deployment and application logs
3. Click "Metrics" to monitor resource usage
4. Set up alerts for deployment failures

## Troubleshooting

### Build fails with yarn error
- Ensure `yarn.lock` is committed to Git
- Check that all dependencies are listed in `package.json`
- Verify Node version compatibility

### Port binding issues
- Railway automatically assigns a PORT environment variable for the service
- The Dockerfile uses port 3000 which is Railway's default

### API connection fails
- Verify `REACT_APP_API_BASE_URL` is correct
- Check backend is running and accessible
- Ensure CORS is configured in backend
- Check browser console for detailed error messages

### Hot reload not working in development
- This is expected in production builds
- Use development mode locally with `yarn start`

### Build takes too long or runs out of memory
- Optimize dependencies
- Use yarn workspaces for monorepo
- Consider caching strategies

## Optimizing Build Size

### Remove unused dependencies
```bash
yarn remove <package-name>
```

### Analyze bundle size
```bash
npm install -g webpack-bundle-analyzer
yarn build
```

### Code splitting tips
- Use React.lazy() for route-based splitting
- Implement dynamic imports for large components
- Tree shake unused code

## Custom Domain Setup

1. In Railway project settings
2. Go to "Networking" > "Public Networking"
3. Click "Generate Domain" or add custom domain
4. Update frontend DNS records (if using custom domain)

## Performance Optimization

- Enable gzip compression (default in serve)
- Use CDN for static assets (Railway CDN or external)
- Implement caching headers
- Minify CSS/JS (automatic in production build)
- Lazy load images and components

## Environment-Specific Configuration

### Development
```env
REACT_APP_API_BASE_URL=http://localhost:8000/api
REACT_APP_ENV=development
REACT_APP_LOG_LEVEL=debug
```

### Staging
```env
REACT_APP_API_BASE_URL=https://staging-backend.railway.app/api
REACT_APP_ENV=staging
REACT_APP_LOG_LEVEL=info
```

### Production
```env
REACT_APP_API_BASE_URL=https://backend.railway.app/api
REACT_APP_ENV=production
REACT_APP_LOG_LEVEL=warn
```

## Cost Optimization

- Monitor build times and optimize
- Scale only when needed
- Archive old logs
- Use railway's free tier during development
- Upgrade to paid plans for production

## Useful Links

- Railway Docs: https://docs.railway.app
- React Deployment: https://create-react-app.dev/deployment/
- Railway Pricing: https://railway.app/pricing
- Node.js Best Practices: https://nodejs.org/en/docs/guides/nodejs-docker-webapp/

## Next Steps

1. Commit all Railway configuration files
2. Deploy backend first
3. Get backend Railway URL
4. Configure frontend environment variables
5. Deploy frontend via Railway Dashboard or CLI
6. Test all API connections
7. Set up custom domain
8. Configure monitoring and alerts
