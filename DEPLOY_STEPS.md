# Step-by-Step Deployment Guide

## Prerequisites
- GitHub account (free)
- Vercel account (free) - https://vercel.com
- Railway account (free) - https://railway.app OR Render account (free) - https://render.com

## Step 1: Initialize Git and Push to GitHub

1. **Initialize git repository:**
   ```bash
   cd ~/Desktop/Mulligan-Dating
   git init
   git add .
   git commit -m "Initial commit - ready for deployment"
   ```

2. **Create a new repository on GitHub:**
   - Go to https://github.com/new
   - Name it `mulligan-dating` (or whatever you want)
   - Don't initialize with README
   - Click "Create repository"

3. **Push to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/mulligan-dating.git
   git branch -M main
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username)

## Step 2: Deploy Backend to Railway

1. **Go to Railway:** https://railway.app
2. **Sign up/Login** (use GitHub to sign in)
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Select your `mulligan-dating` repository**
6. **Railway will auto-detect it's a Node.js project**
7. **Configure the service:**
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Port: Railway will auto-detect (usually 3001)

8. **Add Environment Variables:**
   Click on your service → Variables tab → Add these:
   ```
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=your-super-secret-key-change-this-to-something-random
   ```
   (Generate a random JWT_SECRET - you can use: `openssl rand -base64 32`)

9. **Get your backend URL:**
   - Click on your service
   - Go to "Settings" → "Domains"
   - Railway will give you a URL like: `mulligan-backend.railway.app`
   - Copy this URL!

## Step 3: Deploy Frontend to Vercel

1. **Go to Vercel:** https://vercel.com
2. **Sign up/Login** (use GitHub to sign in)
3. **Click "Add New Project"**
4. **Import your `mulligan-dating` repository**
5. **Configure the project:**
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

6. **Add Environment Variables:**
   Click "Environment Variables" → Add:
   ```
   VITE_API_URL=https://YOUR_RAILWAY_URL.railway.app
   ```
   (Replace `YOUR_RAILWAY_URL` with the Railway URL from Step 2)

7. **Deploy!**
   - Click "Deploy"
   - Wait for build to complete
   - Vercel will give you a URL like: `mulligan-dating.vercel.app`

## Step 4: Update Backend CORS

1. **Go back to Railway**
2. **Add another environment variable:**
   ```
   ALLOWED_ORIGINS=https://YOUR_VERCEL_URL.vercel.app
   ```
   (Replace with your Vercel URL from Step 3)

3. **Redeploy the backend** (Railway will auto-redeploy when you add env vars)

## Step 5: Update Frontend Referral Links

The referral system needs to know the frontend URL. Update the backend environment variable:
```
FRONTEND_URL=https://YOUR_VERCEL_URL.vercel.app
```

## Step 6: Test Your Deployment

1. Visit your Vercel URL
2. Try signing up/logging in
3. Test the app functionality

## Troubleshooting

- **CORS errors:** Make sure `ALLOWED_ORIGINS` in Railway includes your Vercel URL
- **API not connecting:** Check that `VITE_API_URL` in Vercel matches your Railway URL
- **Database issues:** Railway uses ephemeral storage. For production, consider upgrading to PostgreSQL (Railway provides this)

## Next Steps

- Custom domain: Add your own domain in Vercel settings
- Database: Migrate to PostgreSQL for better reliability
- Monitoring: Set up error tracking (Sentry, etc.)

