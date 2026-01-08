import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL || '');

/**
 * GET /api/trending-wallet?type=TOKEN&limit=20
 *
 * Fetches trending tokens from wallet scan data.
 * Queries the materialized view for fast performance.
 * Sorted by popularity score (wallet scan frequency).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'ALL';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    let assets;

    if (type === 'ALL') {
      assets = await sql`
        SELECT * FROM trending_tokens
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    } else {
      assets = await sql`
        SELECT * FROM trending_tokens
        WHERE type = ${type}
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    }

    return NextResponse.json(
      {
        success: true,
        assets: assets,
        cached: true,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[API] Failed to fetch trending:', error);

    // Return empty results instead of error
    return NextResponse.json({
      success: true,
      assets: [],
      cached: false,
      timestamp: new Date().toISOString(),
    });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
