# Deploying Mulligan Dating App

## Current Setup
- **Frontend**: Running on `http://localhost:5173`
- **Backend**: Running on `http://localhost:3001`
- **Database**: SQLite (local file)

## Quick Testing (Temporary Sharing)

### Using ngrok (Easiest for Beta Testing)

1. **Install ngrok**: https://ngrok.com/download
   ```bash
   brew install ngrok
   ```

2. **Get your authtoken** from https://dashboard.ngrok.com/get-started/your-authtoken
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

3. **Start your backend** (in the `backend` directory):
   ```bash
   cd backend
   npm run dev
   ```
   Backend runs on port 3001 by default.

4. **In a new terminal, expose backend with ngrok**:
   ```bash
   ngrok http 3001
   ```
   This gives you a public URL like: `https://abc123.ngrok-free.dev`
   **Copy this URL!**

5. **Create a `.env` file in the `frontend` directory**:
   ```bash
   cd frontend
   echo "VITE_NGROK_URL=https://abc123.ngrok-free.dev" > .env
   ```
   (Replace `https://abc123.ngrok-free.dev` with your actual ngrok URL)

6. **Start your frontend** (in the `frontend` directory):
   ```bash
   npm run dev
   ```

7. **Share your frontend URL** (`http://localhost:5173`) with beta testers
   - They'll need to access it through a tunnel or you can also expose the frontend with ngrok
   - Or deploy the frontend to Vercel (see Production Deployment below)

**Note**: 
- ngrok free tier URLs change every time you restart ngrok
- The frontend will automatically use the ngrok URL for API calls when `VITE_NGROK_URL` is set
- If you want to expose the frontend too, run `ngrok http 5173` in another terminal and share that URL instead

## Production Deployment

### Option 1: Vercel (Frontend) + Railway/Render (Backend)

**Frontend (Vercel)**:
1. Push code to GitHub
2. Connect to Vercel
3. Set build command: `cd frontend && npm run build`
4. Set output directory: `frontend/dist`
5. Add environment variable: `VITE_API_URL=https://your-backend-url.com`

**Backend (Railway/Render)**:
1. Push code to GitHub
2. Deploy on Railway or Render
3. Set environment variables:
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-frontend-url.vercel.app`
   - `JWT_SECRET=your-secret-key`
   - Database: Use PostgreSQL (Railway/Render provide this)

### Option 2: Full Stack on Railway/Render

Deploy both frontend and backend on the same platform:
- Railway: https://railway.app
- Render: https://render.com

### Environment Variables Needed

**Backend (.env)**:
```
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.com
JWT_SECRET=your-strong-secret-key-here
PORT=3001
ALLOWED_ORIGINS=https://your-frontend-url.com
```

**Frontend (.env)**:
```
VITE_API_URL=https://your-backend-url.com
```

## Referral Links

Referral links are automatically generated based on:
1. `FRONTEND_URL` environment variable (if set)
2. Or detected from the request origin
3. Format: `{FRONTEND_URL}/signup?ref={REFERRAL_CODE}`

Make sure `FRONTEND_URL` is set correctly in production!

## Database

For production, consider migrating from SQLite to PostgreSQL:
- More reliable for multiple users
- Better performance
- Easier to backup

