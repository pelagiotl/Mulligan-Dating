# Twilio SMS Setup Guide

## Step 1: Sign up for Twilio

1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account (no credit card required for trial)
3. Verify your email and phone number

## Step 2: Get Your Credentials

1. Once logged in, go to the [Twilio Console](https://console.twilio.com/)
2. You'll see your **Account SID** and **Auth Token** on the dashboard
3. Copy these values

## Step 3: Get a Phone Number

1. In the Twilio Console, go to **Phone Numbers** → **Manage** → **Buy a number**
2. For testing, you can use a **Trial Number** (free)
3. Or buy a number (starts at ~$1/month)
4. Copy the phone number (it will be in E.164 format like `+1234567890`)

## Step 4: Install Twilio SDK

In your backend directory:
```bash
cd backend
npm install twilio
```

## Step 5: Set Environment Variables

Add these to your `.env` file in the `backend` folder:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

## Step 6: For Render Deployment

1. Go to your Render backend service
2. Go to **Environment** tab
3. Add these environment variables:
   - `TWILIO_ACCOUNT_SID` = your Account SID
   - `TWILIO_AUTH_TOKEN` = your Auth Token
   - `TWILIO_PHONE_NUMBER` = your Twilio phone number (E.164 format)

## Testing

### Development Mode
- In development, if Twilio is not configured, the verification code will be logged to the console
- Check your backend terminal for: `🔐 [DEV] Verification code for +1234567890: 123456`

### Production Mode
- SMS will be sent via Twilio
- Users will receive the code on their phone

## Twilio Trial Limitations

- Free trial accounts can only send SMS to verified phone numbers
- To test, add your phone number in Twilio Console → Phone Numbers → Verified Caller IDs
- For production, you'll need to upgrade your Twilio account

## Cost

- **Trial**: Free (limited to verified numbers)
- **Pay-as-you-go**: ~$0.0075 per SMS in the US
- **Phone number**: ~$1/month

## Troubleshooting

### "Twilio client not initialized"
- Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set
- Make sure you've run `npm install twilio`

### "Failed to send SMS"
- Check that `TWILIO_PHONE_NUMBER` is set
- Verify your Twilio account is active
- Check Twilio Console for error logs
- For trial accounts, make sure the recipient number is verified

### SMS not received
- Check spam folder
- Verify phone number format (must be E.164: +1234567890)
- For trial accounts, recipient must be verified in Twilio Console


