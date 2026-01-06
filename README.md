# Dogechain Bubblemaps Analytics API

Analytics backend for Dogechain Bubblemaps search learning system.

## Tech Stack

- **Next.js 15** - API routes (serverless functions)
- **Neon PostgreSQL** - Serverless Postgres database
- **Vercel** - Deployment (free tier: 100K invocations/month)

## API Endpoints

### POST /api/analytics/search
Collects search query events.

**Request:**
```json
{
  "sessionId": "64-char-hex-string",
  "query": "doge",
  "results": ["0x123...", "0x456..."],
  "resultCount": 2,
  "timestamp": 1704067200000
}
```

### POST /api/analytics/click
Collects result click events.

**Request:**
```json
{
  "sessionId": "64-char-hex-string",
  "query": "doge",
  "clickedAddress": "0x123...",
  "resultRank": 0,
  "resultScore": 95.5,
  "timeToClickMs": 1500,
  "timestamp": 1704067201000
}
```

### GET /api/trending/popularity
Fetches popularity metrics for tokens.

**Query Params:**
- `addresses[]` - Array of token addresses (max 100)

**Response:**
```json
{
  "0x123...": {
    "tokenAddress": "0x123...",
    "searchCount": 150,
    "clickCount": 45,
    "ctr": 0.3,
    "lastSearched": 1704067200000,
    "lastClicked": 1704067201000
  }
}
```

### POST /api/trending/popularity
Updates popularity metrics.

**Request:**
```json
{
  "tokenAddress": "0x123...",
  "appearedInResults": true,
  "wasClicked": false,
  "timestamp": 1704067200000
}
```

### GET /api/recommendations/peers
Collaborative filtering recommendations.

**Query Params:**
- `query` - Search query (min 2 chars)
- `type` - "TOKEN" or "NFT" (default: "TOKEN")
- `limit` - Number of recommendations (1-20, default: 5)

**Response:**
```json
{
  "recommendations": [
    {
      "address": "0x789...",
      "name": "DogeCoin",
      "symbol": "DOGE",
      "score": 0.85,
      "reason": "Popular with users who searched similar queries"
    }
  ],
  "query": "doge",
  "type": "TOKEN",
  "count": 1
}
```

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Add your Neon `DATABASE_URL` to `.env.local`.

### 3. Run Development Server
```bash
npm run dev
```

API will be available at `http://localhost:3000/api/*`

## Deployment to Vercel

### Option A: Via Vercel CLI (Recommended)

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Login to Vercel:**
```bash
vercel login
```

3. **Deploy:**
```bash
vercel
```

4. **Add Environment Variable:**
```bash
vercel env add DATABASE_URL
```
Paste your Neon connection string.

5. **Deploy to Production:**
```bash
vercel --prod
```

### Option B: Via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import this GitHub repository
3. Add `DATABASE_URL` environment variable
4. Click "Deploy"

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | ✅ Yes |

## Database Setup

Make sure you've run the migration script in your Neon database:

1. Go to https://console.neon.tech
2. Open SQL Editor
3. Run the migration from `/server/database/neon-migration.sql` in the main project

## Testing

### Test Search Analytics
```bash
curl -X POST https://your-api.vercel.app/api/analytics/search \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "a1b2c3d4e5f6...64chars",
    "query": "doge",
    "results": ["0x123..."],
    "resultCount": 1,
    "timestamp": 1704067200000
  }'
```

### Test Popularity
```bash
curl "https://your-api.vercel.app/api/trending/popularity?addresses[]=0x123..."
```

## Cost Estimation

**Vercel Free Tier:**
- 100K invocations/month
- Sufficient for ~3,000 searches/day
- $0/month

**When to Upgrade:**
- >100K requests/month
- Pro tier: $20/month for 1M invocations

**Neon Free Tier:**
- 0.5 GB storage
- 300 hours compute/month
- ~3 billion row reads/month
- $0/month

**Estimated Usage:**
- 10K searches/day = 300K searches/month
- Need Vercel Pro at high traffic

## Monitoring

Check Vercel dashboard for:
- Invocation count
- Error rate
- Response time
- Database connection health

## Support

- Neon Docs: https://neon.tech/docs
- Vercel Docs: https://vercel.com/docs
- Main Project: `../dogechain-bubblemaps/`

## License

MIT
