/**
 * GET /api/dex-analytics
 *
 * Returns DEX liquidity pool analytics including TVL rankings, new pools,
 * factory distribution, trading volume, OHLCV data, and chain metrics.
 *
 * Integrates with GeckoTerminal API for enhanced trading data.
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

// =====================================================
// Type Definitions
// =====================================================

interface PoolStats {
  address: string;
  token0: { address: string; symbol: string; decimals?: number };
  token1: { address: string; symbol: string; decimals?: number };
  factory: string;
  reserve0: string;
  reserve1: string;
  tvlUsd: number;
  lpTokenSupply: string;
  createdAt: number;
  pairAge: number;
  volume24h?: number;
  priceChange24h?: number;
  marketCap?: number;
}

interface FactoryStats {
  name: string;
  poolCount: number;
  totalTVL: number;
}

interface ChainMetrics {
  chainName: string;
  totalTVL: number;
  dexVolume24h: number;
  dexVolume7d: number;
  activePools: number;
  dailyUsers: number;
}

interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DexAnalyticsResponse {
  pools?: PoolStats[];
  factories?: FactoryStats[];
  data?: OHLCVData[];
  metrics?: ChainMetrics;
  type: 'tvl' | 'new' | 'factory' | 'volume' | 'ohlcv' | 'chain';
  cached: boolean;
  timestamp: string;
}

// =====================================================
// Cache Configuration
// =====================================================

const cache = {
  tvl: null as { data: PoolStats[]; timestamp: number } | null,
  new: null as { data: PoolStats[]; timestamp: number } | null,
  factory: null as { data: FactoryStats[]; timestamp: number } | null,
  volume: null as { data: PoolStats[]; timestamp: number } | null,
  chain: null as { data: ChainMetrics; timestamp: number } | null,
};

const CACHE_TTL = 300000; // 5 minutes for most data
const OHLCV_CACHE_TTL = 60000; // 1 minute for OHLCV data

// =====================================================
// GeckoTerminal Integration
// =====================================================

const GECKO_TERMINAL_API = 'https://api.geckoterminal.com/api/v2';
const DOGECHAIN_NETWORK = 'dogechain';

interface GeckoPoolResponse {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    total_value_locked_usd: string;
    volume_usd: Record<string, string | null>;
    reserve_usd: string;
    price_change_percentage: Record<string, string | null>;
    market_cap_usd?: string;
    created_at: string;
    dex?: {
      id: string;
      name: string;
    };
    base_token: {
      attributes: {
        address: string;
        name: string;
        symbol: string;
        decimals: string;
      };
    };
    quote_token: {
      attributes: {
        address: string;
        name: string;
        symbol: string;
        decimals: string;
      };
    };
  };
}

async function fetchTopPoolsByVolumeFromGecko(limit: number = 20): Promise<PoolStats[]> {
  try {
    const url = `${GECKO_TERMINAL_API}/networks/${DOGECHAIN_NETWORK}/pools?page=1`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    const pools = data.data
      .map((pool: GeckoPoolResponse) => {
        const attr = pool.attributes;
        const volume24h = attr.volume_usd?.['24h']
          ? parseFloat(attr.volume_usd['24h'])
          : 0;
        const priceChange24h = attr.price_change_percentage?.['24h']
          ? parseFloat(attr.price_change_percentage['24h'])
          : 0;
        const marketCap = attr.market_cap_usd
          ? parseFloat(attr.market_cap_usd)
          : 0;

        return {
          address: attr.address.toLowerCase(),
          token0: {
            address: attr.base_token.attributes.address.toLowerCase(),
            symbol: attr.base_token.attributes.symbol,
            decimals: parseInt(attr.base_token.attributes.decimals) || 18,
          },
          token1: {
            address: attr.quote_token.attributes.address.toLowerCase(),
            symbol: attr.quote_token.attributes.symbol,
            decimals: parseInt(attr.quote_token.attributes.decimals) || 18,
          },
          factory: attr.dex?.name || 'Unknown',
          reserve0: attr.reserve_usd || '0',
          reserve1: '0',
          tvlUsd: parseFloat(attr.total_value_locked_usd || '0'),
          lpTokenSupply: '0',
          createdAt: new Date(attr.created_at).getTime(),
          pairAge: Date.now() - new Date(attr.created_at).getTime(),
          volume24h,
          priceChange24h,
          marketCap,
        };
      })
      .filter((p: any) => p.volume24h > 0)
      .sort((a: any, b: any) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, limit);

    return pools;
  } catch (error) {
    console.error('[GeckoTerminal] Failed to fetch volume pools:', error);
    return [];
  }
}

async function fetchOHLCVFromGecko(
  poolAddress: string,
  timeframe: string = '1d'
): Promise<OHLCVData[]> {
  try {
    const timeframeToAggregate: Record<string, number> = {
      '1h': 60,
      '6h': 360,
      '1d': 1440,
    };

    const aggregateMinutes = timeframeToAggregate[timeframe] || 1440;
    const url = `${GECKO_TERMINAL_API}/networks/${DOGECHAIN_NETWORK}/pools/${poolAddress}/ohlcv?timeframe=${timeframe}&aggregate=${aggregateMinutes}&limit=100`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((entry: any) => ({
      timestamp: entry[0],
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5]),
    }));
  } catch (error) {
    console.error('[GeckoTerminal] Failed to fetch OHLCV:', error);
    return [];
  }
}

async function fetchChainMetricsFromGecko(): Promise<ChainMetrics | null> {
  try {
    // GeckoTerminal doesn't provide chain-level metrics directly
    // We'll aggregate from pool data
    const url = `${GECKO_TERMINAL_API}/networks/${DOGECHAIN_NETWORK}/pools?page=1`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return null;
    }

    const pools = data.data;
    const totalTVL = pools.reduce(
      (sum: number, p: GeckoPoolResponse) =>
        sum + parseFloat(p.attributes.total_value_locked_usd || '0'),
      0
    );
    const totalVolume24h = pools.reduce(
      (sum: number, p: GeckoPoolResponse) =>
        sum + parseFloat(p.attributes.volume_usd?.['24h'] || '0'),
      0
    );

    return {
      chainName: 'dogechain',
      totalTVL,
      dexVolume24h: totalVolume24h,
      dexVolume7d: totalVolume24h * 7, // Estimate
      activePools: pools.length,
      dailyUsers: 0, // Not available from GeckoTerminal
    };
  } catch (error) {
    console.error('[GeckoTerminal] Failed to fetch chain metrics:', error);
    return null;
  }
}

// =====================================================
// Route Handler
// =====================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = (searchParams.get('type') || 'tvl') as
    | 'tvl'
    | 'new'
    | 'factory'
    | 'volume'
    | 'ohlcv'
    | 'chain';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const useCache = searchParams.get('cache') !== 'false';
  const pool = searchParams.get('pool');
  const timeframe = searchParams.get('timeframe') || '1d';

  try {
    // ===================================================
    // VOLUME - Top pools by 24h trading volume
    // ===================================================

    if (type === 'volume') {
      if (useCache && cache.volume && Date.now() - cache.volume.timestamp < CACHE_TTL) {
        return NextResponse.json(
          {
            pools: cache.volume.data,
            type,
            cached: true,
            timestamp: new Date(cache.volume.timestamp).toISOString(),
          } as DexAnalyticsResponse,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      }

      // Fetch from GeckoTerminal
      const pools = await fetchTopPoolsByVolumeFromGecko(limit);

      // Update cache
      cache.volume = {
        data: pools,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          pools,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    // ===================================================
    // OHLCV - Price chart data for a specific pool
    // ===================================================

    if (type === 'ohlcv') {
      if (!pool) {
        return NextResponse.json(
          { error: 'Missing pool parameter' },
          { status: 400 }
        );
      }

      const validTimeframes = ['1h', '6h', '1d'];
      const normalizedTimeframe = validTimeframes.includes(timeframe)
        ? timeframe
        : '1d';

      const data = await fetchOHLCVFromGecko(pool, normalizedTimeframe);

      return NextResponse.json(
        {
          data,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        }
      );
    }

    // ===================================================
    // CHAIN - Chain-level metrics
    // ===================================================

    if (type === 'chain') {
      if (useCache && cache.chain && Date.now() - cache.chain.timestamp < CACHE_TTL) {
        return NextResponse.json(
          {
            metrics: cache.chain.data,
            type,
            cached: true,
            timestamp: new Date(cache.chain.timestamp).toISOString(),
          } as DexAnalyticsResponse,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      }

      // Try GeckoTerminal first
      let metrics = await fetchChainMetricsFromGecko();

      if (!metrics) {
        // Fallback to database
        const sql = neon(process.env.DATABASE_URL || '');
        const result = await sql`
          SELECT
            chain_name,
            total_tvl_usd as "totalTVL",
            dex_volume_24h_usd as "dexVolume24h",
            dex_volume_7d_usd as "dexVolume7d",
            active_pools as "activePools",
            daily_users as "dailyUsers"
          FROM chain_metrics
          WHERE chain_name = 'dogechain'
          LIMIT 1
        `;

        if (result.length > 0) {
          metrics = result[0] as ChainMetrics;
        } else {
          metrics = {
            chainName: 'dogechain',
            totalTVL: 0,
            dexVolume24h: 0,
            dexVolume7d: 0,
            activePools: 0,
            dailyUsers: 0,
          };
        }
      }

      // Update cache
      cache.chain = {
        data: metrics,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          metrics,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    // ===================================================
    // TVL - Top pools by total value locked (original)
    // ===================================================

    if (type === 'tvl') {
      if (useCache && cache.tvl && Date.now() - cache.tvl.timestamp < CACHE_TTL) {
        return NextResponse.json(
          {
            pools: cache.tvl.data,
            type,
            cached: true,
            timestamp: new Date(cache.tvl.timestamp).toISOString(),
          } as DexAnalyticsResponse,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      }

      const sql = neon(process.env.DATABASE_URL || '');

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
          volume_24h_usd,
          price_change_24h,
          market_cap_usd,
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
          volume24h: row.volume_24h_usd ? parseFloat(row.volume_24h_usd) : undefined,
          priceChange24h: row.price_change_24h ? parseFloat(row.price_change_24h) : undefined,
          marketCap: row.market_cap_usd ? parseFloat(row.market_cap_usd) : undefined,
        };
      });

      cache.tvl = {
        data: pools,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          pools,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    // ===================================================
    // NEW - Recently created pools (original)
    // ===================================================

    if (type === 'new') {
      if (useCache && cache.new && Date.now() - cache.new.timestamp < CACHE_TTL) {
        return NextResponse.json(
          {
            pools: cache.new.data,
            type,
            cached: true,
            timestamp: new Date(cache.new.timestamp).toISOString(),
          } as DexAnalyticsResponse,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      }

      const sql = neon(process.env.DATABASE_URL || '');
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
          volume_24h_usd,
          price_change_24h,
          market_cap_usd,
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
          volume24h: row.volume_24h_usd ? parseFloat(row.volume_24h_usd) : undefined,
          priceChange24h: row.price_change_24h ? parseFloat(row.price_change_24h) : undefined,
          marketCap: row.market_cap_usd ? parseFloat(row.market_cap_usd) : undefined,
        };
      });

      cache.new = {
        data: pools,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          pools,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    // ===================================================
    // FACTORY - Factory distribution (original)
    // ===================================================

    if (type === 'factory') {
      if (useCache && cache.factory && Date.now() - cache.factory.timestamp < CACHE_TTL) {
        return NextResponse.json(
          {
            factories: cache.factory.data,
            type,
            cached: true,
            timestamp: new Date(cache.factory.timestamp).toISOString(),
          } as DexAnalyticsResponse,
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      }

      const sql = neon(process.env.DATABASE_URL || '');

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

      cache.factory = {
        data: factories,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          factories,
          type,
          cached: false,
          timestamp: new Date().toISOString(),
        } as DexAnalyticsResponse,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    return NextResponse.json(
      { error: 'Invalid type parameter. Must be tvl, new, factory, volume, ohlcv, or chain' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[DEX Analytics API] Error:', error);

    return NextResponse.json(
      {
        pools: [],
        factories: [],
        data: [],
        metrics: {
          chainName: 'dogechain',
          totalTVL: 0,
          dexVolume24h: 0,
          dexVolume7d: 0,
          activePools: 0,
          dailyUsers: 0,
        },
        type,
        error: 'Failed to fetch DEX analytics data',
        cached: false,
        timestamp: new Date().toISOString(),
      } as DexAnalyticsResponse,
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
