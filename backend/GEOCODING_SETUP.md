# Geocoding Setup Guide

This guide explains how to set up geocoding for accurate distance calculations in Mulligan.

## Option 1: Use Without API Keys (Works Immediately) ✅

**No setup needed!** The app will automatically use Nominatim (OpenStreetMap), which is free but has rate limits.

- ✅ Works immediately
- ✅ No API keys required
- ⚠️ Rate limited (1 request per second)
- ✅ Perfect for development and testing

Just restart your backend server and it will work!

## Option 2: Use With API Keys (Recommended for Production) 🚀

For better performance and no rate limits, set up an API key.

### Step 1: Choose a Provider

**Option A: Mapbox (Recommended - Easy Setup)**
- Free tier: 100,000 requests/month
- Easy to set up
- Get token: https://account.mapbox.com/access-tokens/

**Option B: Google Maps**
- Free tier: $200 credit/month
- More features
- Get key: https://console.cloud.google.com/google/maps-apis

### Step 2: Create .env File

1. Open your terminal
2. Navigate to the backend folder:
   ```bash
   cd backend
   ```

3. Create a `.env` file:
   ```bash
   touch .env
   ```
   
   Or create it manually in your code editor.

### Step 3: Add Your API Key

Open the `.env` file and add ONE of these:

**For Mapbox:**
```
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

**For Google Maps:**
```
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

**Example:**
```
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6ImN...rest_of_token
```

### Step 4: Install Dependencies

If you haven't already, install the dotenv package:

```bash
cd backend
npm install
```

### Step 5: Restart Backend Server

Stop your backend server (Ctrl+C) and restart it:

```bash
npm run dev
```

The backend will automatically load your API key from the `.env` file.

## How It Works

The app tries providers in this order:
1. **Mapbox** (if `MAPBOX_ACCESS_TOKEN` is set)
2. **Google Maps** (if `GOOGLE_MAPS_API_KEY` is set)
3. **Nominatim** (free fallback if no keys are set)

The first available provider will be used automatically.

## Testing

To test if geocoding is working:

1. Make sure you have location data in user profiles
2. Try generating matches - the system will geocode locations automatically
3. Check backend logs for any geocoding errors

## Troubleshooting

**"Geocoding provider failed" in logs:**
- Check your API key is correct
- Make sure the `.env` file is in the `backend/` folder
- Restart the backend server after creating/editing `.env`

**Rate limit errors:**
- You're using the free Nominatim service
- Consider adding a Mapbox or Google Maps API key
- Or wait a moment between requests

**Distance calculations seem wrong:**
- Make sure location strings are in a recognizable format (e.g., "City, State" or "City, Country")
- More specific locations work better (e.g., "San Francisco, CA" vs just "San Francisco")









