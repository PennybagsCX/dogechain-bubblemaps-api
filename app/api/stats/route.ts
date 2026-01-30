/**
 * GET /api/stats
 *
 * Returns aggregate statistics counters for the application.
 * These counters display in the header and footer showing:
 * - Total Searches (aggregate count of all token/NFT searches)
 * - Total Alerts Fired (aggregate count of all triggered alert events)
 *
 * After migration_phase3_alerts_counter.sql, the alerts count is read
 * from the alert_counters table for O(1) performance instead of COUNT(*).
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface StatsResponse {
  searches: number;
  alerts: number;
  cached: boolean;
  timestamp: string;
}

// Simple in-memory cache
let cache: {
  data: { searches: number; alerts: number };
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const useCache = searchParams.get('cache') !== 'false';

    // Check cache
    if (useCache && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      const response: StatsResponse = {
        searches: cache.data.searches,
        alerts: cache.data.alerts,
        cached: true,
        timestamp: new Date(cache.timestamp).toISOString(),
      };
      return NextResponse.json(response, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    const sql = neon(process.env.DATABASE_URL || '');

    // Query total searches from token_interactions table
    const searchesResult = await sql`
      SELECT COUNT(*) as count
      FROM token_interactions
      WHERE interaction_type = 'search'
    `;

    // Query total alerts from alert_counters table (O(1) instead of COUNT(*))
    // Fallback to COUNT(*) if counter table doesn't exist yet (migration safety)
    let alerts = 0;
    try {
      const counterResult = await sql`
        SELECT total_alerts FROM alert_counters WHERE id = 1
      `;
      alerts = parseInt(counterResult[0]?.total_alerts || '0', 10);
    } catch (counterError) {
      // Counter table doesn't exist yet (migration not run), fall back to COUNT(*)
      console.warn('[Stats API] Counter table not found, falling back to COUNT(*)');
      const alertsResult = await sql`
        SELECT COUNT(*) as count
        FROM triggered_alerts
      `;
      alerts = parseInt(alertsResult[0]?.count || '0', 10);
    }

    const searches = parseInt(searchesResult[0]?.count || '0', 10);

    // Update cache
    cache = {
      data: { searches, alerts },
      timestamp: Date.now(),
    };

    const response: StatsResponse = {
      searches,
      alerts,
      cached: false,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('[Stats API] Error:', error);

    // Return zeros on error (frontend will show 0 instead of failing)
    const response: StatsResponse = {
      searches: 0,
      alerts: 0,
      cached: false,
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(response, { status: 200 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
