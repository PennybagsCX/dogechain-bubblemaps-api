/**
 * GET /api/trending/popularity?addresses[]=0x...
 * POST /api/trending/popularity
 *
 * Token popularity metrics for search ranking.
 *
 * Environment Variables:
 * - DATABASE_URL: Neon PostgreSQL connection string
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface TokenPopularityData {
  tokenAddress: string;
  searchCount: number;
  clickCount: number;
  ctr: number;
  lastSearched: number | null;
  lastClicked: number | null;
}

interface PopularityUpdateRequest {
  tokenAddress: string;
  appearedInResults: boolean;
  wasClicked: boolean;
  timestamp: number;
}

// GET - Fetch popularity metrics
export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL || '');
    const { searchParams } = new URL(request.url);
    const addresses = searchParams.getAll("addresses[]");

    if (addresses.length === 0 || addresses.length > 100) {
      return NextResponse.json(
        { error: addresses.length === 0 ? "Missing addresses" : "Too many addresses (max 100)" },
        { status: 400 }
      );
    }

    // Validate addresses
    const addressRegex = /^0x[a-f0-9]{40}$/i;
    for (const address of addresses) {
      if (!addressRegex.test(address)) {
        return NextResponse.json(
          { error: `Invalid Ethereum address: ${address}` },
          { status: 400 }
        );
      }
    }

    // Fetch from Neon
    const results = (await sql`
      SELECT
        token_address,
        search_count,
        click_count,
        COALESCE(ctr, 0) as ctr,
        EXTRACT(EPOCH FROM last_searched) * 1000 as last_searched,
        EXTRACT(EPOCH FROM last_clicked) * 1000 as last_clicked
      FROM token_popularity
      WHERE token_address = ANY(${addresses}::varchar[])
    `) as any[];

    const popularity: Record<string, TokenPopularityData> = {};

    for (const row of results) {
      popularity[row.token_address.toLowerCase()] = {
        tokenAddress: row.token_address,
        searchCount: row.search_count,
        clickCount: row.click_count,
        ctr: parseFloat(row.ctr),
        lastSearched: row.last_searched ? parseInt(row.last_searched) : null,
        lastClicked: row.last_clicked ? parseInt(row.last_clicked) : null,
      };
    }

    return NextResponse.json(popularity, { status: 200 });
  } catch (error) {
    console.error("[Popularity] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Update popularity metrics
export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL || '');
    const body: PopularityUpdateRequest = await request.json();

    if (!body.tokenAddress || typeof body.timestamp !== "number") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate address
    const addressRegex = /^0x[a-f0-9]{40}$/i;
    if (!addressRegex.test(body.tokenAddress)) {
      return NextResponse.json(
        { error: `Invalid Ethereum address: ${body.tokenAddress}` },
        { status: 400 }
      );
    }

    // Update in Neon
    await sql`
      INSERT INTO token_popularity (token_address, search_count, click_count, last_searched, last_clicked, updated_at)
      VALUES (${body.tokenAddress}, ${body.appearedInResults ? 1 : 0}, ${body.wasClicked ? 1 : 0}, to_timestamp(${body.timestamp} / 1000.0), to_timestamp(${body.timestamp} / 1000.0), NOW())
      ON CONFLICT (token_address) DO UPDATE SET
        search_count = token_popularity.search_count + ${body.appearedInResults ? 1 : 0},
        click_count = token_popularity.click_count + ${body.wasClicked ? 1 : 0},
        last_searched = CASE WHEN ${body.appearedInResults} THEN to_timestamp(${body.timestamp} / 1000.0) ELSE token_popularity.last_searched END,
        last_clicked = CASE WHEN ${body.wasClicked} THEN to_timestamp(${body.timestamp} / 1000.0) ELSE token_popularity.last_clicked END,
        updated_at = NOW()
    `;

    console.log("[Popularity] Updated:", body.tokenAddress);

    return NextResponse.json(
      { success: true, updated: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Popularity] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
