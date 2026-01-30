/**
 * POST /api/alerts
 *
 * Handles alert-related actions with query parameter support.
 * DEPRECATED: The /api/alerts/trigger endpoint is now the preferred way to log alerts.
 * This endpoint is maintained for backward compatibility.
 *
 * - action=trigger: Logs triggered alerts for analytics (redirects to /api/alerts/trigger)
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface TriggerRequestBody {
  alertId: string;
  alertName: string;
  walletAddress: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  transactionCount: number;
}

interface TriggerResponse {
  success: boolean;
  logged: boolean;
  newCount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Only handle 'trigger' action for now
    if (action !== 'trigger') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Supported: trigger' },
        { status: 400 }
      );
    }

    const body: TriggerRequestBody = await request.json();

    // Validate required fields
    if (!body.alertId || !body.alertName || !body.walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: alertId, alertName, walletAddress' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.walletAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Validate token address if provided
    if (body.tokenAddress && !/^0x[a-fA-F0-9]{40}$/.test(body.tokenAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address format' },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL || '');

    // Insert into triggered_alerts table
    // The database trigger (trigger_increment_alert_counter) will atomically
    // increment the alert_counters.total_alerts counter after this INSERT
    let logged = false;
    let newCount: number | undefined;

    try {
      await sql`
        INSERT INTO triggered_alerts (
          alert_id,
          alert_name,
          wallet_address,
          token_address,
          token_symbol,
          transaction_count,
          triggered_at
        )
        VALUES (
          ${body.alertId},
          ${body.alertName},
          ${body.walletAddress.toLowerCase()},
          ${body.tokenAddress?.toLowerCase() || null},
          ${body.tokenSymbol || null},
          ${body.transactionCount},
          NOW()
        )
        ON CONFLICT (alert_id, wallet_address, token_address, triggered_at)
        DO NOTHING
      `;

      logged = true;

      // Fetch the new counter value
      const counterResult = await sql`
        SELECT total_alerts FROM alert_counters WHERE id = 1
      `;
      newCount = counterResult[0]?.total_alerts
        ? parseInt(counterResult[0].total_alerts, 10)
        : undefined;

    } catch (dbError) {
      // Log database error but don't fail the request
      console.error('[Alerts] Database error:', dbError);
      // Continue - we still want to return success to not block the UI
    }

    const response: TriggerResponse = {
      success: true,
      logged,
      ...(newCount !== undefined && { newCount }),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[Alerts] Error:', error);

    // Return success even on error to not block UI
    return NextResponse.json(
      { success: true, logged: false },
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
