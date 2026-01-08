import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL || '');

/**
 * GET /api/learned-tokens?type=TOKEN&limit=20&min_popularity=10
 *
 * Fetches learned tokens from the database with optional filters.
 * Returns tokens sorted by popularity score.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'ALL';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const minPopularity = parseFloat(searchParams.get('min_popularity') || '0');

    let tokens;

    if (type === 'ALL' && minPopularity === 0) {
      // Simple case - no filters
      tokens = await sql`
        SELECT address, name, symbol, decimals, type,
               popularity_score, scan_frequency, holder_count,
               discovery_timestamp, last_seen_at
        FROM learned_tokens
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    } else if (type !== 'ALL' && minPopularity === 0) {
      // Filter by type only
      tokens = await sql`
        SELECT address, name, symbol, decimals, type,
               popularity_score, scan_frequency, holder_count,
               discovery_timestamp, last_seen_at
        FROM learned_tokens
        WHERE type = ${type}
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    } else if (type === 'ALL' && minPopularity > 0) {
      // Filter by popularity only
      tokens = await sql`
        SELECT address, name, symbol, decimals, type,
               popularity_score, scan_frequency, holder_count,
               discovery_timestamp, last_seen_at
        FROM learned_tokens
        WHERE popularity_score >= ${minPopularity.toString()}
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    } else {
      // Filter by both
      tokens = await sql`
        SELECT address, name, symbol, decimals, type,
               popularity_score, scan_frequency, holder_count,
               discovery_timestamp, last_seen_at
        FROM learned_tokens
        WHERE type = ${type} AND popularity_score >= ${minPopularity.toString()}
        ORDER BY popularity_score DESC
        LIMIT ${limit.toString()}
      `;
    }

    return NextResponse.json(
      {
        success: true,
        tokens: tokens,
        count: Array.isArray(tokens) ? tokens.length : 0,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[API] Failed to fetch learned tokens:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learned tokens' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learned-tokens
 *
 * Batch add/update learned tokens.
 * Upserts on conflict (increments scan_frequency and popularity_score).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tokens = Array.isArray(body) ? body : [body];

    if (!tokens || tokens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No tokens provided' },
        { status: 400 }
      );
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const token of tokens) {
      if (!token.address || !token.type) {
        console.warn('[API] Skipping invalid token:', token);
        continue;
      }

      const address = token.address.toLowerCase();
      const name = token.name ? String(token.name).slice(0, 255) : null;
      const symbol = token.symbol ? String(token.symbol).slice(0, 50) : null;
      const decimals = token.decimals ? parseInt(token.decimals, 10) : 18;
      const type = token.type === 'NFT' ? 'NFT' : 'TOKEN';
      const source = token.source ? String(token.source).slice(0, 50) : 'wallet_scan';

      // Check if token exists
      const existing = await sql`
        SELECT id FROM learned_tokens WHERE address = ${address}
      `;

      if (existing.length > 0) {
        // Update existing token
        await sql`
          UPDATE learned_tokens
          SET
            name = COALESCE(${name}, learned_tokens.name),
            symbol = COALESCE(${symbol}, learned_tokens.symbol),
            decimals = COALESCE(${decimals}, learned_tokens.decimals),
            scan_frequency = learned_tokens.scan_frequency + 1,
            last_seen_at = NOW(),
            popularity_score = LEAST(100, learned_tokens.popularity_score + 5)
          WHERE address = ${address}
        `;
        updatedCount++;
      } else {
        // Insert new token
        await sql`
          INSERT INTO learned_tokens (
            address, name, symbol, decimals, type, source,
            discovery_timestamp, last_seen_at
          )
          VALUES (${address}, ${name}, ${symbol}, ${decimals}, ${type}, ${source}, NOW(), NOW())
        `;
        addedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
    });
  } catch (error) {
    console.error('[API] Failed to add learned tokens:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add tokens' },
      { status: 400 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
