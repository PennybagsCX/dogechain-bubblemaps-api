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

    // Log the interaction
    await sql`
      INSERT INTO token_interactions (
        token_address, interaction_type, session_id, query_text, result_position
      )
      VALUES (${address}, ${interactionType}, ${sessionId || null}, ${queryText || null}, ${resultPosition || null})
    `;

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
