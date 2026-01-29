/**
 * GET /api/dex-analytics
 *
 * Returns DEX liquidity pool analytics including TVL rankings, new pools, and factory distribution.
 * Queries pool data from the database.
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface PoolStats {
  address: string;
  token0: { address: string; symbol: string };
  token1: { address: string; symbol: string };
  factory: string;
  reserve0: string;
  reserve1: string;
  tvlUsd: number;
  lpTokenSupply: string;
  createdAt: number;
  pairAge: number;
}

interface FactoryStats {
  name: string;
  poolCount: number;
  totalTVL: number;
}

interface DexAnalyticsResponse {
  pools?: PoolStats[];
  factories?: FactoryStats[];
  type: 'tvl' | 'new' | 'factory';
  cached: boolean;
  timestamp: string;
}

// Simple in-memory cache
const cache = {
  tvl: null as { data: PoolStats[]; timestamp: number } | null,
  new: null as { data: PoolStats[]; timestamp: number } | null,
  factory: null as { data: FactoryStats[]; timestamp: number } | null,
};
const CACHE_TTL = 300000; // 5 minutes

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = (searchParams.get('type') || 'tvl') as 'tvl' | 'new' | 'factory';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const useCache = searchParams.get('cache') !== 'false';

  try {

    // Check cache
    const cacheKey = type;
    const cached = cache[cacheKey];
    if (useCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const response: DexAnalyticsResponse = {
        [type === 'factory' ? 'factories' : 'pools']: cached.data,
        type,
        cached: true,
        timestamp: new Date(cached.timestamp).toISOString(),
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

    if (type === 'tvl') {
      // Fetch top pools by TVL
      const poolsResult = await sql`
        SELECT
          pool_address,
          token0_address,
          token0_symbol,
          token1_address,
          token1_symbol,
          factory_name,
          reserve0,
          reserve1,
          tvl_usd,
          lp_token_supply,
          created_at
        FROM dex_pools
        WHERE tvl_usd > 0
        ORDER BY tvl_usd DESC
        LIMIT ${limit}
      `;

      const pools: PoolStats[] = poolsResult.map((row: any) => {
        const pairAge = Date.now() - new Date(row.created_at).getTime();
        return {
          address: row.pool_address,
          token0: {
            address: row.token0_address,
            symbol: row.token0_symbol || 'TOKEN0',
          },
          token1: {
            address: row.token1_address,
            symbol: row.token1_symbol || 'TOKEN1',
          },
          factory: row.factory_name,
          reserve0: row.reserve0 || '0',
          reserve1: row.reserve1 || '0',
          tvlUsd: parseFloat(row.tvl_usd) || 0,
          lpTokenSupply: row.lp_token_supply || '0',
          createdAt: new Date(row.created_at).getTime(),
          pairAge,
        };
      });

      // Update cache
      cache.tvl = {
        data: pools,
        timestamp: Date.now(),
      };

      const response: DexAnalyticsResponse = {
        pools,
        type,
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
    }

    if (type === 'new') {
      // Fetch new pools created in the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const poolsResult = await sql`
        SELECT
          pool_address,
          token0_address,
          token0_symbol,
          token1_address,
          token1_symbol,
          factory_name,
          reserve0,
          reserve1,
          tvl_usd,
          lp_token_supply,
          created_at
        FROM dex_pools
        WHERE created_at >= ${sevenDaysAgo}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      const pools: PoolStats[] = poolsResult.map((row: any) => {
        const pairAge = Date.now() - new Date(row.created_at).getTime();
        return {
          address: row.pool_address,
          token0: {
            address: row.token0_address,
            symbol: row.token0_symbol || 'TOKEN0',
          },
          token1: {
            address: row.token1_address,
            symbol: row.token1_symbol || 'TOKEN1',
          },
          factory: row.factory_name,
          reserve0: row.reserve0 || '0',
          reserve1: row.reserve1 || '0',
          tvlUsd: parseFloat(row.tvl_usd) || 0,
          lpTokenSupply: row.lp_token_supply || '0',
          createdAt: new Date(row.created_at).getTime(),
          pairAge,
        };
      });

      // Update cache
      cache.new = {
        data: pools,
        timestamp: Date.now(),
      };

      const response: DexAnalyticsResponse = {
        pools,
        type,
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
    }

    if (type === 'factory') {
      // Fetch factory distribution
      const factoriesResult = await sql`
        SELECT
          factory_name,
          COUNT(*) as pool_count,
          COALESCE(SUM(tvl_usd), 0) as total_tvl
        FROM dex_pools
        GROUP BY factory_name
        ORDER BY pool_count DESC
      `;

      const factories: FactoryStats[] = factoriesResult.map((row: any) => ({
        name: row.factory_name,
        poolCount: parseInt(row.pool_count) || 0,
        totalTVL: parseFloat(row.total_tvl) || 0,
      }));

      // Update cache
      cache.factory = {
        data: factories,
        timestamp: Date.now(),
      };

      const response: DexAnalyticsResponse = {
        factories,
        type,
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
    }

    return NextResponse.json(
      { error: 'Invalid type parameter. Must be tvl, new, or factory' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[DEX Analytics API] Error:', error);

    return NextResponse.json(
      {
        pools: [],
        factories: [],
        type,
        error: 'Failed to fetch DEX analytics data',
        cached: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
