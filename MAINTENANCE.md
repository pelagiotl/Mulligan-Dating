# Maintenance Notification Guide

## How to Show Maintenance Notifications to Users

### Method 1: Using Environment Variables (Recommended for Render)

1. **Go to Render Dashboard**
   - Open your frontend service
   - Go to "Environment" tab
   - Add these environment variables:

2. **To Enable Maintenance Mode:**
   ```
   VITE_MAINTENANCE_MODE=true
   VITE_MAINTENANCE_MESSAGE=We're performing scheduled maintenance. The app may be temporarily unavailable. We'll be back in about 5 minutes!
   ```

3. **To Disable Maintenance Mode:**
   ```
   VITE_MAINTENANCE_MODE=false
   ```
   (Or just remove the variable)

4. **Redeploy** your frontend service after changing environment variables

### Method 2: Quick Code Update (For Immediate Changes)

If you need to show a maintenance notice immediately without waiting for a redeploy:

1. Edit `frontend/src/components/MaintenanceBanner.tsx`
2. Change the component to always show:
   ```tsx
   <MaintenanceBanner 
     isActive={true} 
     message="We're updating the app. Please save your work. Back in 2 minutes!"
   />
   ```
3. Push and deploy

### Method 3: Programmatic Control (Future Enhancement)

You could also create an admin endpoint to toggle maintenance mode via the database, but for now, environment variables are the simplest approach.

## Best Practices

1. **Give Advance Warning**: Enable maintenance mode 5-10 minutes before deployment
2. **Clear Message**: Tell users what's happening and how long it will take
3. **Timing**: Deploy during low-traffic hours when possible
4. **Disable After**: Remember to turn off maintenance mode after deployment completes

## Example Messages

- "We're performing scheduled maintenance. The app may be temporarily unavailable. We'll be back in about 5 minutes!"
- "Quick update in progress! The app will be unavailable for about 1 minute. Please save your work."
- "New features incoming! We're updating the app. Back in 2 minutes! 🚀"


