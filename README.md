# Dogechain Bubblemaps API

Backend API for Dogechain Bubblemaps analytics, trending, and recommendations.

**Built with:** Next.js 15 + TypeScript + Neon PostgreSQL
**Deployed:** https://dogechain-bubblemaps-api.vercel.app
**Framework:** App Router (Serverless API Routes)

---

## Overview

This API provides:
- **Analytics** - Search and click event tracking
- **Trending** - Real-time trending assets based on search frequency
- **Recommendations** - Collaborative filtering for token discovery
- **Proxy** - Dogechain Explorer API proxy to avoid CORS issues
- **Health** - System monitoring and uptime checks

**Tech Stack:**
- **Next.js 15** - API routes (serverless functions)
- **Neon PostgreSQL** - Serverless Postgres database
- **Vercel** - Deployment platform (free tier: 100K invocations/month)
- **TypeScript** - Type safety and validation

---

## API Endpoints

### Analytics

#### POST /api/analytics/search
Track search query events for aggregate learning and analytics.

**Request Body:**
```typescript
{
  sessionId: string;      // 64-character hex session ID
  query: string;           // Search query (2-500 characters)
  results: string[];       // Array of token addresses (max 100)
  resultCount: number;     // Number of results
  timestamp: number;       // Unix timestamp in milliseconds
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "saved": true
}
```

**Use Cases:**
- Track what users are searching for
- Build search analytics and insights
- Improve search relevance over time

---

#### POST /api/analytics/click
Track click events on search results for popularity scoring.

**Request Body:**
```typescript
{
  sessionId: string;        // 64-character hex session ID
  query: string;             // Original search query
  clickedAddress: string;    // Token address that was clicked
  resultRank: number;        // Position in results (0-indexed)
  resultScore: number;       // Relevance score
  timeToClickMs: number;     // Time from search to click (ms)
  timestamp: number;         // Unix timestamp in milliseconds
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "saved": true
}
```

**Use Cases:**
- Measure search result relevance
- Calculate click-through rates
- Improve ranking algorithms

---

### Trending

#### GET /api/trending
Get trending tokens and NFTs based on search frequency.

**Query Parameters:**
- `type` (optional): "TOKEN", "NFT", or "ALL" (default: "ALL")
- `limit` (optional): Max results 1-100 (default: 20)

**Response (200 OK):**
```json
{
  "assets": [
    {
      "address": "0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2",
      "symbol": "DOGE",
      "name": "DogeCoin",
      "type": "TOKEN",
      "velocityScore": 95.5,
      "totalSearches": 1500,
      "recentSearches": 450,
      "previousSearches": 1050,
      "rank": 1
    }
  ],
  "cached": true,
  "stale": false,
  "timestamp": "2026-01-06T12:00:00.000Z"
}
```

**Use Cases:**
- Display trending tokens on homepage
- Show popular searches
- Discover trending assets

**Caching:** 5 minutes with stale-while-revalidate

---

#### POST /api/trending/log
Log search queries for trending calculation (fire-and-forget).

**Request Body:**
```typescript
{
  address: string;          // Token contract address (0x...)
  assetType: "TOKEN" | "NFT";
  symbol?: string;          // Optional token symbol
  name?: string;            // Optional token name
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "logged": true
}
```

**Use Cases:**
- Track search frequency for trending
- Fire-and-forget logging (doesn't block UI)
- Increment search counts on tokens

**Note:** Returns success even if logging fails to prevent blocking the user interface.

---

#### GET /api/trending/popularity
Get popularity metrics for multiple tokens.

**Query Parameters:**
- `addresses[]` (required): Token addresses (max 100)

**Response (200 OK):**
```json
{
  "0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2": {
    "tokenAddress": "0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2",
    "searchCount": 150,
    "clickCount": 75,
    "ctr": 0.5,
    "lastSearched": 1704556800000,
    "lastClicked": 1704556815000
  }
}
```

**Use Cases:**
- Batch fetch popularity metrics
- Boost search results by popularity
- Display click-through rates

---

#### POST /api/trending/popularity
Update popularity metrics for a token (increment counters).

**Request Body:**
```typescript
{
  tokenAddress: string;      // Token contract address
  appearedInResults: boolean; // Whether token appeared in search
  wasClicked: boolean;        // Whether user clicked on token
  timestamp: number;          // Unix timestamp in milliseconds
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "updated": true
}
```

**Use Cases:**
- Increment search counters
- Increment click counters
- Track last interaction time

---

### Recommendations

#### GET /api/recommendations/peers
Get collaborative filtering recommendations based on peer behavior.

**Query Parameters:**
- `query` (required): Search query (min 2 chars)
- `type` (optional): "TOKEN" or "NFT" (default: "TOKEN")
- `limit` (optional): Number of recommendations 1-20 (default: 5)

**Response (200 OK):**
```json
{
  "recommendations": [
    {
      "address": "0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2",
      "symbol": "DOGE",
      "name": "DogeCoin",
      "type": "TOKEN",
      "score": 0.85
    }
  ]
}
```

**Use Cases:**
- Suggest related tokens
- Collaborative filtering
- Discover similar assets

---

### Proxy

#### GET /api/dogechain-proxy
Proxy requests to Dogechain Explorer API to avoid CORS issues.

**Query Parameters:**
All query parameters are forwarded to `https://explorer.dogechain.dog/api`

**Response:** Returns the exact response from Dogechain Explorer API

**Use Cases:**
- Avoid CORS issues with Dogechain Explorer API
- Avoid SSL certificate issues on mobile browsers
- Single source of truth for blockchain data

**Caching:** 1 minute cache
**CORS:** Configured for public access

**Example:**
```bash
# Get token supply
curl "https://dogechain-bubblemaps-api.vercel.app/api/dogechain-proxy?module=stats&action=tokensupply&contractaddress=0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2"

# Get contract source code
curl "https://dogechain-bubblemaps-api.vercel.app/api/dogechain-proxy?module=contract&action=getsourcecode&address=0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2"
```

---

### System

#### GET /api/health
Health check endpoint for monitoring and uptime checks.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-01-06T12:00:00.000Z"
}
```

**Use Cases:**
- Health monitoring
- Uptime checks
- Database connection verification

---

## Database Schema

### Tables

#### search_events
Search query tracking for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique identifier |
| `session_id` | VARCHAR(64) | Session identifier |
| `query` | VARCHAR(500) | Search query text |
| `results` | JSONB | Array of result addresses |
| `result_count` | INTEGER | Number of results |
| `timestamp` | TIMESTAMPTZ | Event timestamp |

**Indexes:**
- `session_id` - For session-based queries
- `query` - For query analytics
- `timestamp` - For time-based filtering

---

#### click_events
Click event tracking for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique identifier |
| `session_id` | VARCHAR(64) | Session identifier |
| `query` | VARCHAR(500) | Original search query |
| `clicked_address` | VARCHAR(42) | Token address clicked |
| `result_rank` | INTEGER | Position in results |
| `result_score` | DECIMAL | Relevance score |
| `time_to_click_ms` | INTEGER | Time to click (ms) |
| `timestamp` | TIMESTAMPTZ | Event timestamp |

**Indexes:**
- `session_id` - For session-based queries
- `clicked_address` - For token-based analytics
- `timestamp` - For time-based filtering

---

#### trending_searches
Aggregated trending data (pre-computed).

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PRIMARY KEY | Unique identifier |
| `address` | VARCHAR UNIQUE | Token contract address |
| `asset_type` | VARCHAR | "TOKEN" or "NFT" |
| `symbol` | VARCHAR(50) | Token symbol |
| `name` | VARCHAR(255) | Token name |
| `search_count` | INTEGER | Total search count |
| `created_at` | TIMESTAMPTZ | First seen timestamp |
| `updated_at` | TIMESTAMPTZ | Last updated timestamp |

**Indexes:**
- `address` - Unique constraint
- `search_count` - For trending sorting
- `updated_at` - For recency sorting
- `asset_type` - For type filtering

---

#### token_popularity
Popularity metrics for search ranking.

| Column | Type | Description |
|--------|------|-------------|
| `token_address` | VARCHAR(42) PRIMARY KEY | Token contract address |
| `search_count` | INTEGER | Total search count |
| `click_count` | INTEGER | Total click count |
| `ctr` | DECIMAL(5,2) | Click-through rate |
| `last_searched` | TIMESTAMPTZ | Last search timestamp |
| `last_clicked` | TIMESTAMPTZ | Last click timestamp |
| `updated_at` | TIMESTAMPTZ | Last updated timestamp |

**Indexes:**
- `token_address` - Primary key
- `search_count` - For popularity sorting
- `ctr` - For CTR-based ranking

---

## Development

### Prerequisites
- Node.js 18+
- Neon PostgreSQL database
- npm package manager

### Setup

**1. Clone repository:**
```bash
cd "/Volumes/DEV Projects/dogechain-bubblemaps-api"
```

**2. Install dependencies:**
```bash
npm install
```

**3. Create environment file:**
```bash
cp .env.example .env.local
```

**4. Edit `.env.local`:**
```bash
# Neon PostgreSQL database connection
DATABASE_URL=postgresql://user:password@ep-xxx.aws.neon.tech/dbname?sslmode=require
```

**5. Run development server:**
```bash
npm run dev
```

**6. Test API:**
```bash
# Health check
curl http://localhost:3000/api/health

# Should return: {"status":"healthy","database":"connected"}
```

---

### Project Structure

```
app/
├── api/
│   ├── analytics/
│   │   ├── search/
│   │   │   └── route.ts          # Search event tracking
│   │   └── click/
│   │       └── route.ts          # Click event tracking
│   ├── trending/
│   │   ├── route.ts              # Get trending assets
│   │   ├── log/
│   │   │   └── route.ts          # Log searches
│   │   └── popularity/
│   │       └── route.ts          # Popularity metrics
│   ├── recommendations/
│   │   └── peers/
│   │       └── route.ts          # Peer recommendations
│   ├── dogechain-proxy/
│   │   └── route.ts              # Dogechain Explorer proxy
│   └── health/
│       └── route.ts              # Health check
├── layout.tsx
└── page.tsx

next.config.js                     # CORS configuration
package.json
tsconfig.json
```

---

## Deployment

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | ✅ Yes |

### Deployment Process

**Automatic Deployment:**
1. Push to `main` branch
2. GitHub Actions triggers automatically
3. Vercel builds and deploys
4. Tests run automatically

**Manual Deployment:**

#### Option A: Via Vercel CLI (Recommended)

**1. Install Vercel CLI:**
```bash
npm i -g vercel
```

**2. Login to Vercel:**
```bash
vercel login
```

**3. Deploy:**
```bash
vercel
```

**4. Add Environment Variable:**
```bash
vercel env add DATABASE_URL
```
Paste your Neon connection string.

**5. Deploy to Production:**
```bash
vercel --prod
```

#### Option B: Via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import GitHub repository: `PennybagsCX/dogechain-bubblemaps-api`
3. Add `DATABASE_URL` environment variable in project settings
4. Click "Deploy"

**Deployment URL:** https://dogechain-bubblemaps-api.vercel.app

---

## Verification

After deployment, verify the API is working:

```bash
# Health check
curl https://dogechain-bubblemaps-api.vercel.app/api/health

# Test trending endpoint
curl "https://dogechain-bubblemaps-api.vercel.app/api/trending?type=TOKEN&limit=5"

# Test log endpoint
curl -X POST https://dogechain-bubblemaps-api.vercel.app/api/trending/log \
  -H "Content-Type: application/json" \
  -d '{"address":"0x1234567890123456789012345678901234567890","assetType":"TOKEN","symbol":"TEST","name":"Test Token"}'

# Test proxy endpoint
curl "https://dogechain-bubblemaps-api.vercel.app/api/dogechain-proxy?module=stats&action=tokensupply&contractaddress=0xbdaD927604c5cB78F15b3669a92Fa5A1427d33a2"
```

---

## Cost Estimation

### Vercel Free Tier
- 100K invocations/month
- Sufficient for ~3,000 searches/day
- $0/month

### When to Upgrade
- >100K requests/month
- Pro tier: $20/month for 1M invocations

### Neon Free Tier
- 0.5 GB storage
- 300 hours compute/month
- ~3 billion row reads/month
- $0/month

### Estimated Usage
- 10K searches/day = 300K searches/month
- Need Vercel Pro at high traffic

---

## Monitoring

Check Vercel dashboard for:
- Invocation count
- Error rate
- Response time
- Database connection health

### Health Monitoring

Setup external monitoring:
```bash
# Health check endpoint
curl https://dogechain-bubblemaps-api.vercel.app/api/health
```

Recommended tools:
- UptimeRobot (free)
- Pingdom
- StatusCake

---

## Troubleshooting

### Database Connection Issues

**Symptom:** Health check returns database error

**Solution:**
1. Verify `DATABASE_URL` is set correctly in Vercel
2. Check Neon database is active
3. Ensure connection string includes `?sslmode=require`
4. Test connection with psql:
   ```bash
   psql $DATABASE_URL
   ```

### CORS Errors

**Symptom:** Browser shows CORS policy errors

**Solution:**
1. Check `next.config.js` has correct CORS headers
2. Ensure frontend URL is in allowed origins
3. Verify no conflicting CORS settings

### Environment Variables Not Working

**Symptom:** API calls failing or wrong URLs

**Solution:**
1. Check Vercel project settings > Environment Variables
2. Ensure variables are set for all environments (Production, Preview, Development)
3. Redeploy after changing variables

---

## Documentation

**Frontend Documentation:**
- **[API Reference](../Dogechain\ Bubblemaps/docs/API_REFERENCE.md)** - Complete endpoint documentation
- **[Deployment Guide](../Dogechain\ Bubblemaps/docs/DEPLOYMENT_GUIDE.md)** - Setup and deployment instructions
- **[Frontend README](../Dogechain\ Bubblemaps/README.md)** - Main project documentation

**External Resources:**
- [Next.js Documentation](https://nextjs.org/docs)
- [Neon Documentation](https://neon.tech/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review Vercel function logs
- Verify database connection
- Check environment variables

---

**Last Updated:** 2026-01-06

**API Version:** 1.0.0

**Base URL:** https://dogechain-bubblemaps-api.vercel.app

**Framework:** Next.js 15 + TypeScript + Neon PostgreSQL
