# X-Lab Site - Redis & Analytics Setup

## What was implemented

### 1. Upstash Redis Integration
- **Package installed**: `@upstash/redis`
- **Configuration**: Added Redis credentials to `.env.local`
- **Redis client**: Created at `src/lib/redis.ts`

### 2. Contact Form with Redis Storage
- **API Route**: `src/app/api/contact/route.ts` - Handles form submissions
- **Contact Form Component**: `src/app/[locale]/contact/ContactForm.tsx` - Client component with form submission
- **Contact Page**: Updated `src/app/[locale]/contact/page.tsx` to use the new form component

**Features**:
- Stores contact submissions in Redis
- Validates email format
- Captures timestamp, IP, and user agent
- Shows success/error messages
- Disables form during submission

### 3. Vercel Analytics & Speed Insights
- **Packages installed**:
  - `@vercel/analytics`
  - `@vercel/speed-insights`
- **Integration**: Added to `src/app/layout.tsx`

## How to view contact submissions

### API Endpoint
You can view all contact submissions by calling:
```
GET /api/contact/submissions
```

This returns the 50 most recent submissions in JSON format.

### Example Response
```json
{
  "submissions": [
    {
      "id": "contact:1704110400000:abc123",
      "name": "John Doe",
      "email": "john@example.com",
      "message": "Hello, I'm interested in X-Caption",
      "timestamp": "2025-01-01T12:00:00.000Z",
      "userAgent": "Mozilla/5.0...",
      "ip": "192.168.1.1"
    }
  ]
}
```

## Redis Data Structure

### Keys
- **Individual submissions**: `contact:{timestamp}:{random}`
- **Sorted set for listings**: `contact:submissions` (sorted by timestamp)

## Environment Variables

All Redis credentials are stored in `.env.local`:
- `KV_REST_API_READ_ONLY_TOKEN`
- `KV_REST_API_TOKEN`
- `KV_REST_API_URL`
- `KV_URL`
- `REDIS_URL`

## Translation Keys Added

### English (`messages/en.json`)
- `contactPage.submitting`: "Sending..."
- `contactPage.successMessage`: "Message sent successfully! We'll get back to you soon."

### Chinese (`messages/zh-Hant.json`)
- `contactPage.submitting`: "發送中..."
- `contactPage.successMessage`: "訊息已成功發送！我們會盡快回覆你。"

## Testing

To test the contact form:
1. Visit `/en/contact` or `/zh-Hant/contact`
2. Fill out the form and submit
3. You should see a success message
4. Check submissions at `/api/contact/submissions`

## Deployment Notes

When deploying to Vercel:
1. Add all environment variables from `.env.local` to Vercel project settings
2. Analytics and Speed Insights will automatically work (no additional config needed)
3. Make sure to redeploy after adding environment variables
