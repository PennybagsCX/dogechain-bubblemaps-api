/**
 * GET /api/recommendations/peers?query=doge&type=TOKEN&limit=5
 *
 * Collaborative filtering: Find tokens frequently clicked by users who searched similar queries.
 *
 * Environment Variables:
 * - DATABASE_URL: Neon PostgreSQL connection string
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL);

interface PeerRecommendationData {
  address: string;
  name: string;
  symbol: string;
  score: number;
  reason: string;
}

// GET - Peer recommendations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const type = searchParams.get("type") || "TOKEN";
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    // Validate parameters
    if (!query || query.length < 2 || query.length > 500) {
      return NextResponse.json(
        { error: "Invalid query (2-500 characters)" },
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 20) {
      return NextResponse.json(
        { error: "Invalid limit (1-20)" },
        { status: 400 }
      );
    }

    if (type !== "TOKEN" && type !== "NFT") {
      return NextResponse.json(
        { error: "Invalid type (must be TOKEN or NFT)" },
        { status: 400 }
      );
    }

    // Get peer recommendations using pg_trgm
    const results = (await sql`
      WITH similar_queries AS (
        SELECT DISTINCT query
        FROM search_events
        WHERE
          query % ${query} AND
          similarity(query, ${query}) > 0.3 AND
          timestamp > NOW() - INTERVAL '30 days'
        LIMIT 100
      ),
      clicked_tokens AS (
        SELECT
          ce.clicked_address,
          COUNT(*) as frequency,
          MAX(ce.timestamp) as last_clicked
        FROM click_events ce
        INNER JOIN similar_queries sq ON ce.query = sq.query
        WHERE ce.timestamp > NOW() - INTERVAL '30 days'
        GROUP BY ce.clicked_address
        ORDER BY frequency DESC
        LIMIT ${limit}
      )
      SELECT
        ct.clicked_address as address,
        COALESCE(tsi.name, 'Unknown Token') as name,
        COALESCE(tsi.symbol, 'UNKNOWN') as symbol,
        (ct.frequency::FLOAT / (SELECT SUM(frequency) FROM clicked_tokens)) as score,
        CASE
          WHEN ct.frequency > 10 THEN 'Popular with users who searched similar queries'
          ELSE 'Frequently clicked result'
        END as reason
      FROM clicked_tokens ct
      LEFT JOIN token_search_index tsi ON tsi.address = ct.clicked_address
      WHERE tsi.type = ${type}
      ORDER BY ct.frequency DESC
    `) as any[];

    const recommendations = results.map((row: any) => ({
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      score: parseFloat(row.score),
      reason: row.reason,
    }));

    return NextResponse.json(
      {
        recommendations,
        query,
        type,
        count: recommendations.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Peer Recommendations] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
