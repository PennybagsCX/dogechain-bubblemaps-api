/**
 * GET /api/health
 *
 * Health check endpoint for monitoring.
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL || '');

    // Test database connection
    await sql`SELECT 1`;

    return NextResponse.json(
      {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
