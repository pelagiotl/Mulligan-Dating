# PostgreSQL Migration Guide

## Step 1: Create PostgreSQL Database on Render

1. Go to your Render Dashboard: https://dashboard.render.com
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `mulligan-db` (or any name you prefer)
   - **Database**: `mulligan` (or any name)
   - **User**: `mulligan_user` (or any name)
   - **Region**: Choose closest to your backend
   - **Plan**: Free (for now)
4. Click **"Create Database"**
5. Wait for it to provision (takes 1-2 minutes)
6. Once created, you'll see a **"Internal Database URL"** - copy this!

## Step 2: Add Environment Variable to Backend

1. Go to your **Backend Service** on Render
2. Click **"Environment"** tab
3. Add a new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the Internal Database URL from Step 1
   - It should look like: `postgres://mulligan_user:password@dpg-xxxxx-a/mulligan`
4. Click **"Save Changes"**

## Step 3: Install Dependencies

The code has been updated to include `pg` (PostgreSQL client). When you deploy, it will install automatically.

## Step 4: Deploy Backend

1. Push your code changes to GitHub
2. Render will automatically redeploy
3. Check the logs to see: `🐘 Using PostgreSQL database` and `✅ PostgreSQL connected successfully`

## Step 5: Verify Migration

1. Create a test account on your Render app
2. Log out and log back in
3. Your account should persist! 🎉

## How It Works

- **Local Development**: Uses SQLite (no changes needed)
- **Production (Render)**: Uses PostgreSQL when `DATABASE_URL` is set
- The code automatically detects which database to use

## Troubleshooting

### Database connection fails
- Check that `DATABASE_URL` is set correctly in Render
- Make sure you're using the **Internal Database URL** (not external)
- Check backend logs for connection errors

### Tables not created
- The `initDatabase()` function will create tables automatically
- Check backend logs for any SQL errors
- PostgreSQL uses slightly different SQL syntax than SQLite

### Data not persisting
- Make sure `DATABASE_URL` is set in Render environment variables
- Check that the backend is actually using PostgreSQL (look for `🐘 Using PostgreSQL database` in logs)

