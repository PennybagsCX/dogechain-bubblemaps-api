/**
 * POST /api/trending/log
 *
 * Logs search queries for trending calculation.
 * Fire-and-forget approach - doesn't block on errors.
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface LogRequestBody {
  address: string;
  assetType: 'TOKEN' | 'NFT';
  symbol?: string;
  name?: string;
}

interface LogResponse {
  success: boolean;
  logged: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: LogRequestBody = await request.json();

    // Validate required fields
    if (!body.address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    if (!body.assetType || (body.assetType !== 'TOKEN' && body.assetType !== 'NFT')) {
      return NextResponse.json(
        { success: false, error: 'assetType must be TOKEN or NFT' },
        { status: 400 }
      );
    }

    // Validate address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL || '');

    // Insert or update search count (upsert)
    try {
      await sql`
        INSERT INTO trending_searches (address, asset_type, symbol, name, search_count, created_at, updated_at)
        VALUES (
          ${body.address.toLowerCase()},
          ${body.assetType},
          ${body.symbol || null},
          ${body.name || null},
          1,
          NOW(),
          NOW()
        )
        ON CONFLICT (address)
        DO UPDATE SET
          search_count = trending_searches.search_count + 1,
          updated_at = NOW(),
          symbol = COALESCE(EXCLUDED.symbol, ${body.symbol || null}),
          name = COALESCE(EXCLUDED.name, ${body.name || null})
      `;
    } catch (dbError) {
      // Log database error but don't fail the request
      console.error('[Trending Log] Database error:', dbError);
      // Continue - we still want to return success to not block the UI
    }

    const response: LogResponse = {
      success: true,
      logged: true,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[Trending Log] Error:', error);

    // Return success even on error to not block UI
    return NextResponse.json(
      { success: true, logged: false },
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
