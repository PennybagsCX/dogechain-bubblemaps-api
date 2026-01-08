/**
 * GET /api/trending
 *
 * Returns trending assets based on search frequency and velocity score.
 * Velocity score = (recent_searches / previous_searches) * 100
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface TrendingAsset {
  address: string;
  symbol: string | null;
  name: string | null;
  type: 'TOKEN' | 'NFT';
  velocityScore: number;
  totalSearches: number;
  recentSearches: number;
  previousSearches: number;
  rank: number;
}

interface TrendingApiResponse {
  assets: TrendingAsset[];
  cached: boolean;
  stale?: boolean;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'ALL').toUpperCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const useCache = searchParams.get('cache') !== 'false';

    // Validate type parameter
    if (type !== 'TOKEN' && type !== 'NFT' && type !== 'ALL') {
      return NextResponse.json(
        { error: 'Invalid type parameter. Must be TOKEN, NFT, or ALL' },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL || '');

    // Query trending assets from the aggregated trending_searches table
    let results;

    if (type === 'ALL') {
      results = await sql`
        SELECT
          address,
          asset_type as type,
          COALESCE(symbol, 'TOKEN') as symbol,
          COALESCE(name, 'Token') as name,
          search_count as total_searches,
          search_count as recent_searches,
          0 as previous_searches,
          search_count as velocity_score
        FROM trending_searches
        ORDER BY search_count DESC, updated_at DESC
        LIMIT ${limit}
      `;
    } else {
      results = await sql`
        SELECT
          address,
          asset_type as type,
          COALESCE(symbol, 'TOKEN') as symbol,
          COALESCE(name, 'Token') as name,
          search_count as total_searches,
          search_count as recent_searches,
          0 as previous_searches,
          search_count as velocity_score
        FROM trending_searches
        WHERE asset_type = ${type}
        ORDER BY search_count DESC, updated_at DESC
        LIMIT ${limit}
      `;
    }

    // Transform results to match frontend expectations
    const assets: TrendingAsset[] = results.map((row: any, index: number) => ({
      address: row.address,
      symbol: row.symbol,
      name: row.name,
      type: row.type,
      velocityScore: Math.round(row.velocity_score || 0),
      totalSearches: row.total_searches,
      recentSearches: row.recent_searches,
      previousSearches: row.previous_searches || 0,
      rank: index + 1,
    }));

    const response: TrendingApiResponse = {
      assets,
      cached: useCache,
      stale: false,
      timestamp: new Date().toISOString(),
    };

    // Add cache header if caching is enabled
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (useCache) {
      headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=600'; // 5 min cache, 10 min stale
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    return NextResponse.json(response, { status: 200, headers });
  } catch (error) {
    console.error('[Trending API] Error fetching trending assets:', error);

    // Return empty array on error (frontend will use local trending as fallback)
    return NextResponse.json(
      {
        assets: [],
        cached: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
