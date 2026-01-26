# Troubleshooting: Mulligan Not Opening

## Issues Found

1. **Missing Dependencies**: The `backend` and `frontend` workspaces don't have `node_modules` installed
2. **npm Permissions Issue**: System-level npm permissions are blocking installation
3. **Missing .env File**: Backend expects a `.env` file but only `.envv` exists

## Quick Fix Steps

### Step 1: Fix npm Permissions (if needed)

If you're getting permission errors, try one of these:

**Option A: Use nvm (Recommended)**
```bash
# If you have nvm installed
nvm use 20
npm install
```

**Option B: Fix npm cache permissions**
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

**Option C: Use a different npm cache location**
```bash
npm install --cache /tmp/.npm
```

### Step 2: Install Dependencies

From the project root:
```bash
cd /Users/code404/Desktop/Mulligan-Dating
npm install
```

If that doesn't work, install in each workspace separately:
```bash
cd backend
npm install

cd ../frontend
npm install
```

### Step 3: Create .env File

The backend needs a `.env` file. Copy the `.envv` file or create a new one:

```bash
cd backend
cp .envv .env
# Or create a new .env file with at minimum:
# JWT_SECRET=your-secret-key-here
```

### Step 4: Start the App

Once dependencies are installed:
```bash
# From project root
npm run dev
```

This will start both:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Alternative: Manual Start

If `npm run dev` doesn't work, start each server separately:

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

## Still Having Issues?

1. Check Node.js version: `node --version` (should be 18+)
2. Check npm version: `npm --version` (should be 9+)
3. Try clearing npm cache: `npm cache clean --force`
4. Delete `node_modules` and `package-lock.json` and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   rm -rf backend/node_modules backend/package-lock.json
   rm -rf frontend/node_modules frontend/package-lock.json
   npm install
   ```








