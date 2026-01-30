import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL || '');

/**
 * POST /api/interactions
 *
 * Logs user interactions (search/click/select) for analytics.
 * Updates token popularity scores:
 * - search: +0 points (tracking only)
 * - click: +3 points
 * - select: +5 points
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenAddress, interactionType, sessionId, queryText, resultPosition } = body;

    if (!tokenAddress || !interactionType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate interaction type
    const validTypes = ['search', 'click', 'select'];
    if (!validTypes.includes(interactionType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid interaction type' },
        { status: 400 }
      );
    }

    // Validate and sanitize token address
    const address = String(tokenAddress).toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address' },
        { status: 400 }
      );
    }

    // Ensure token exists in learned_tokens table (required by foreign key constraint)
    // Use INSERT with ON CONFLICT DO NOTHING to silently skip if it already exists
    try {
      await sql`
        INSERT INTO learned_tokens (address, symbol, name, type, popularity_score)
        VALUES (${address}, ${queryText?.substring(0, 50) || 'UNKNOWN'}, ${queryText?.substring(0, 255) || 'Unknown Token'}, 'TOKEN', 0)
        ON CONFLICT (address) DO NOTHING
      `;
    } catch (e) {
      // Ignore error - token might already exist or table might have different constraints
      const errMsg = e instanceof Error ? e.message : String(e);
      console.log('[API] Note: Could not ensure token in learned_tokens:', errMsg);
    }

    // Log the interaction
    try {
      await sql`
        INSERT INTO token_interactions (
          token_address, interaction_type, session_id, query_text, result_position
        )
        VALUES (${address}, ${interactionType}, ${sessionId || null}, ${queryText || null}, ${resultPosition || null})
      `;
    } catch (insertError) {
      // Check if this is a foreign key error (token doesn't exist in learned_tokens)
      // If so, we tried our best to create it but failed - return success anyway
      const err = insertError as { code?: string };
      if (err.code === '23503') {
        console.log('[API] Token not in learned_tokens, skipping interaction logging');
        return NextResponse.json({
          success: true,
          logged: false,
        });
      }
      throw insertError;
    }

    // Update popularity score based on interaction type
    let scoreIncrease = 0;
    if (interactionType === 'click') {
      scoreIncrease = 3;
    } else if (interactionType === 'select') {
      scoreIncrease = 5;
    }

    if (scoreIncrease > 0) {
      await sql`
        UPDATE learned_tokens
        SET popularity_score = LEAST(100, popularity_score + ${scoreIncrease})
        WHERE address = ${address}
      `;
    }

    return NextResponse.json({
      success: true,
      logged: true,
    });
  } catch (error) {
    console.error('[API] Failed to log interaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log interaction' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
