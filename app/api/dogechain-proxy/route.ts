/**
 * GET /api/dogechain-proxy
 *
 * Proxies requests to Dogechain Explorer API to avoid CORS issues
 * and SSL certificate problems on certain browsers (e.g., Arc Browser for iOS).
 *
 * All query parameters are forwarded to the Dogechain Explorer API.
 */

import { NextRequest, NextResponse } from 'next/server';

const DOGECHAIN_API_BASE = 'https://explorer.dogechain.dog/api';

export async function GET(request: NextRequest) {
  try {
    // Extract all query parameters from the request
    const searchParams = request.nextUrl.searchParams.toString();

    if (!searchParams) {
      return NextResponse.json(
        { error: 'No query parameters provided' },
        { status: 400 }
      );
    }

    // Construct the target URL
    const targetUrl = `${DOGECHAIN_API_BASE}?${searchParams}`;

    // Forward the request to Dogechain Explorer API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Dogechain Bubblemaps API/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Dogechain Proxy] API error:', response.status, response.statusText);
      return NextResponse.json(
        {
          error: 'Dogechain API error',
          status: response.status,
          message: response.statusText,
        },
        { status: response.status }
      );
    }

    // Get the response data
    const data = await response.json();

    // Return the response with appropriate CORS headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=60', // Cache for 1 minute
    };

    return NextResponse.json(data, { status: 200, headers });
  } catch (error) {
    console.error('[Dogechain Proxy] Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
