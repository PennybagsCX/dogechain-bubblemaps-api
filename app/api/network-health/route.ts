/**
 * GET /api/network-health
 *
 * Returns Dogechain network health metrics including block time, gas price, and TPS.
 * This endpoint queries the Dogechain RPC for real-time network statistics.
 */

import { NextRequest, NextResponse } from 'next/server';

interface NetworkStats {
  currentBlockNumber: number;
  blockTime: number;
  averageBlockTime: number;
  gasPrice: string;
  tps: number;
  congestion: 'low' | 'medium' | 'high';
}

interface NetworkHealthResponse {
  stats: NetworkStats | null;
  history?: any[];
  cached: boolean;
  timestamp: string;
}

// Simple in-memory cache
let cache: {
  stats: NetworkStats | null;
  timestamp: number;
} | null = null;

const CACHE_TTL = 10000; // 10 seconds

async function fetchNetworkStats(): Promise<NetworkStats> {
  try {
    // Dogechain RPC endpoint
    const rpcUrl = 'https://rpc.dogechain.dog';

    // Fetch latest block
    const blockResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1,
      }),
    });

    const blockData = await blockResponse.json();

    if (!blockData.result) {
      throw new Error('Failed to fetch block data');
    }

    const block = blockData.result;
    const blockNumber = parseInt(block.number, 16);
    const timestamp = parseInt(block.timestamp, 16) * 1000;
    const gasPrice = block.gasUsed || '0x0';

    // Calculate block time (approximate based on current time vs block timestamp)
    const blockTime = Math.max(Date.now() - timestamp, 2500); // Min 2.5s to avoid negative/zero

    // Calculate congestion based on gas usage
    const gasUsed = parseInt(block.gasUsed || '0x0', 16);
    const gasLimit = parseInt(block.gasLimit || '0x0', 16);
    const utilization = gasLimit > 0 ? gasUsed / gasLimit : 0;

    // Calculate TPS (transactions per second)
    const txCount = block.transactions?.length || 0;
    const tps = blockTime > 0 ? (txCount / (blockTime / 1000)) : 0;

    // Determine congestion level
    let congestion: 'low' | 'medium' | 'high' = 'low';
    if (utilization > 0.8 || blockTime > 5000) {
      congestion = 'high';
    } else if (utilization > 0.5 || blockTime > 3500) {
      congestion = 'medium';
    }

    return {
      currentBlockNumber: blockNumber,
      blockTime,
      averageBlockTime: blockTime, // Simplified - would use rolling average
      gasPrice: gasPrice,
      tps,
      congestion,
    };
  } catch (error) {
    console.error('[Network Health API] Error fetching network stats:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const history = searchParams.get('history');
    const useCache = searchParams.get('cache') !== 'false';

    // Check cache
    if (useCache && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      const response: NetworkHealthResponse = {
        stats: cache.stats,
        cached: true,
        timestamp: new Date(cache.timestamp).toISOString(),
      };
      return NextResponse.json(response, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=10',
        },
      });
    }

    // Fetch fresh data
    const stats = await fetchNetworkStats();

    // Update cache
    cache = {
      stats,
      timestamp: Date.now(),
    };

    const response: NetworkHealthResponse = {
      stats,
      cached: false,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (error) {
    console.error('[Network Health API] Error:', error);

    // Return error response
    return NextResponse.json(
      {
        error: 'Failed to fetch network health data',
        stats: null,
        cached: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 } // Return 200 with null data to avoid frontend errors
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
