/**
 * POST /api/analytics/search
 *
 * Collects search query events from all users for aggregate learning.
 *
 * Environment Variables:
 * - DATABASE_URL: Neon PostgreSQL connection string
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL || '');

interface SearchEventRequest {
  sessionId: string;
  query: string;
  results: string[];
  resultCount: number;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchEventRequest = await request.json();

    // Validate required fields
    if (!body.sessionId || !body.query || !body.results || !body.timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate session ID format (64-char hex)
    if (!/^[a-f0-9]{64}$/i.test(body.sessionId)) {
      return NextResponse.json(
        { error: "Invalid sessionId format" },
        { status: 400 }
      );
    }

    // Validate query length
    if (body.query.length < 2 || body.query.length > 500) {
      return NextResponse.json(
        { error: "Invalid query length (2-500 characters)" },
        { status: 400 }
      );
    }

    // Validate results array
    if (!Array.isArray(body.results) || body.results.length > 100) {
      return NextResponse.json(
        { error: "Invalid results array (max 100)" },
        { status: 400 }
      );
    }

    // Validate Ethereum addresses
    const addressRegex = /^0x[a-f0-9]{40}$/i;
    for (const address of body.results) {
      if (!addressRegex.test(address)) {
        return NextResponse.json(
          { error: `Invalid Ethereum address: ${address}` },
          { status: 400 }
        );
      }
    }

    // Insert into Neon
    await sql`
      INSERT INTO search_events (session_id, query, results, result_count, timestamp)
      VALUES (${body.sessionId}, ${body.query}, ${JSON.stringify(body.results)}::jsonb, ${body.resultCount}, to_timestamp(${body.timestamp} / 1000.0))
    `;

    console.log("[Analytics] Search event saved:", body.query);

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
