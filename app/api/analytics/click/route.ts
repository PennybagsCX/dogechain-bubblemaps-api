/**
 * POST /api/analytics/click
 *
 * Collects click events on search results for popularity scoring.
 *
 * Environment Variables:
 * - DATABASE_URL: Neon PostgreSQL connection string
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface ClickEventRequest {
  sessionId: string;
  query: string;
  clickedAddress: string;
  resultRank: number;
  resultScore: number;
  timeToClickMs: number;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL || '');
    const body: ClickEventRequest = await request.json();

    // Validate required fields
    if (!body.sessionId || !body.query || !body.clickedAddress) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate session ID format
    if (!/^[a-f0-9]{64}$/i.test(body.sessionId)) {
      return NextResponse.json(
        { error: "Invalid sessionId format" },
        { status: 400 }
      );
    }

    // Validate query length
    if (body.query.length < 2 || body.query.length > 500) {
      return NextResponse.json(
        { error: "Invalid query length" },
        { status: 400 }
      );
    }

    // Validate Ethereum address
    const addressRegex = /^0x[a-f0-9]{40}$/i;
    if (!addressRegex.test(body.clickedAddress)) {
      return NextResponse.json(
        { error: `Invalid Ethereum address: ${body.clickedAddress}` },
        { status: 400 }
      );
    }

    // Validate result rank
    if (typeof body.resultRank !== "number" || body.resultRank < 0 || body.resultRank > 99) {
      return NextResponse.json(
        { error: "Invalid resultRank (must be 0-99)" },
        { status: 400 }
      );
    }

    // Insert into Neon
    await sql`
      INSERT INTO click_events (session_id, query, clicked_address, result_rank, result_score, time_to_click_ms, timestamp)
      VALUES (${body.sessionId}, ${body.query}, ${body.clickedAddress}, ${body.resultRank}, ${body.resultScore}, ${body.timeToClickMs}, to_timestamp(${body.timestamp} / 1000.0))
    `;

    console.log("[Analytics] Click event saved:", body.clickedAddress);

    return NextResponse.json(
      { success: true, saved: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Analytics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
