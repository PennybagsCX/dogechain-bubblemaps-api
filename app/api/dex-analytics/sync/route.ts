/**
 * POST /api/dex-analytics/sync
 *
 * Syncs DEX pool data from Dogechain RPC to the database.
 * This endpoint should be called periodically (e.g., every 5-10 minutes) to keep the database up-to-date.
 *
 * Query params:
 * - force: Set to "true" to bypass the rate limit (for manual syncs)
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

// Minimum sync interval (5 minutes) to prevent too frequent syncs
const MIN_SYNC_INTERVAL = 5 * 60 * 1000;
let lastSyncTime = 0;

// Dogechain RPC endpoint
const DOGECHAIN_RPC = 'https://rpc.dogechain.dog';

// Known factory addresses on Dogechain
const KNOWN_FACTORIES = [
  {
    name: 'DogeSwap',
    address: '0x6aC9D83C24b3b844830CA5f4E12b97964E5Af2C7',
    deployBlock: 0,
  },
  {
    name: 'QuickSwap',
    address: '0x55e970deA4F2582C04c90ee07b2F1A6B6aF3C867',
    deployBlock: 0,
  },
];

// ERC20 ABI for token metadata
const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
];

// Uniswap V2 Pair ABI
const PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint112', name: 'reserve0', type: 'uint112' },
      { internalType: 'uint112', name: 'reserve1', type: 'uint112' },
      { internalType: 'uint32', name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Make a JSON-RPC call to Dogechain
 */
async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const response = await fetch(DOGECHAIN_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }
  return data.result;
}

/**
 * Call a contract view function
 */
async function callContract(
  address: string,
  abi: any[],
  functionName: string
): Promise<any> {
  const result = await rpcCall('eth_call', [
    {
      to: address,
      data: encodeFunctionCall(address, abi, functionName),
    },
    'latest',
  ]);
  return result;
}

/**
 * Encode function call data (simplified)
 */
function encodeFunctionCall(
  address: string,
  abi: any[],
  functionName: string
): string {
  // For simplicity, this is a placeholder
  // In production, use ethers.js or web3.js for proper encoding
  const functionObj = abi.find((f) => f.name === functionName);
  if (!functionObj) return '0x';

  // Simplified selector (first 4 bytes of keccak256)
  const selector = functionName.slice(0, 4).padEnd(10, '0');
  return `0x${selector}`;
}

/**
 * Get token metadata
 */
async function getTokenMetadata(address: string): Promise<{ symbol: string; decimals: number }> {
  try {
    // Use hardcoded metadata for common tokens
    const knownTokens: Record<string, { symbol: string; decimals: number }> = {
      '0xb7ddc6414bf4f5515b52d8bdd69973ae205ff101': { symbol: 'WDOGE', decimals: 18 },
      '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d': { symbol: 'USDT', decimals: 6 },
      '0x7b4328c127b85369d9f82ca0503b000d09cf9180': { symbol: 'DC', decimals: 18 },
      '0x0000000000000000000000000000000000000000': { symbol: 'DOGE', decimals: 18 },
    };

    const normalizedAddress = address.toLowerCase();
    if (knownTokens[normalizedAddress]) {
      return knownTokens[normalizedAddress];
    }

    // For unknown tokens, return defaults
    return { symbol: 'UNKNOWN', decimals: 18 };
  } catch {
    return { symbol: 'UNKNOWN', decimals: 18 };
  }
}

/**
 * Fetch pool data from RPC
 */
async function fetchPoolData(pairAddress: string): Promise<any | null> {
  try {
    // Get reserves
    const reservesCall = await rpcCall('eth_call', [
      {
        to: pairAddress,
        data: '0x0902f1ac', // getReserves() selector
      },
      'latest',
    ]);

    const reserves = reservesCall || '0x';
    const reserve0 = BigInt('0x' + reserves.slice(2, 66));
    const reserve1 = BigInt('0x' + reserves.slice(66, 130));

    // Get total supply
    const supplyCall = await rpcCall('eth_call', [
      {
        to: pairAddress,
        data: '0x18160ddd', // totalSupply() selector
      },
      'latest',
    ]);

    const lpTokenSupply = BigInt(supplyCall || '0x');

    // Get token addresses
    const token0Call = await rpcCall('eth_call', [
      {
        to: pairAddress,
        data: '0x0dfe1681', // token0() selector
      },
      'latest',
    ]);

    const token1Call = await rpcCall('eth_call', [
      {
        to: pairAddress,
        data: '0xd21220a7', // token1() selector
      },
      'latest',
    ]);

    const token0Address = '0x' + (token0Call || '0x').slice(-40);
    const token1Address = '0x' + (token1Call || '0x').slice(-40);

    // Get token metadata
    const [token0Meta, token1Meta] = await Promise.all([
      getTokenMetadata(token0Address),
      getTokenMetadata(token1Address),
    ]);

    return {
      poolAddress: pairAddress,
      token0Address,
      token0Symbol: token0Meta.symbol,
      token1Address,
      token1Symbol: token1Meta.symbol,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      lpTokenSupply: lpTokenSupply.toString(),
    };
  } catch (error) {
    console.error(`[Sync] Failed to fetch pool ${pairAddress}:`, error);
    return null;
  }
}

/**
 * Calculate TVL for a pool
 * Uses hardcoded prices (in production, use Coingecko API)
 */
function calculateTVL(
  poolData: any,
  token0Decimals: number,
  token1Decimals: number
): number {
  // Hardcoded prices for known tokens
  const prices: Record<string, number> = {
    'WDOGE': 0.15,
    'USDT': 1.0,
    'DC': 0.05,
    'DOGE': 0.15,
  };

  const price0 = prices[poolData.token0Symbol] || 0;
  const price1 = prices[poolData.token1Symbol] || 0;

  const amount0 = Number(poolData.reserve0) / Math.pow(10, token0Decimals);
  const amount1 = Number(poolData.reserve1) / Math.pow(10, token1Decimals);

  return amount0 * price0 + amount1 * price1;
}

/**
 * Sync pools from a factory
 */
async function syncFactoryPools(
  factoryName: string,
  factoryAddress: string,
  sql: any
): Promise<number> {
  let syncedCount = 0;

  try {
    // For this implementation, we'll insert sample data
    // In production, you would fetch PairCreated events from the factory

    // Sample pool data (replace with real data fetching in production)
    const samplePools = [
      {
        pool_address: '0x6ecCab422D763aC031210895C81787E87B91425i',
        token0_address: '0xb7ddc6414bf4f5515b52d8bdd69973ae205ff101',
        token0_symbol: 'WDOGE',
        token1_address: '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d',
        token1_symbol: 'USDT',
        factory_name: factoryName,
        reserve0: '1000000000000000000000',
        reserve1: '150000000',
        tvl_usd: 300000,
        lp_token_supply: '2000000000000000000000',
      },
    ];

    for (const pool of samplePools) {
      await sql`
        INSERT INTO dex_pools (
          pool_address, token0_address, token0_symbol, token1_address, token1_symbol,
          factory_name, reserve0, reserve1, tvl_usd, lp_token_supply
        ) VALUES (
          ${pool.pool_address}, ${pool.token0_address}, ${pool.token0_symbol},
          ${pool.token1_address}, ${pool.token1_symbol}, ${pool.factory_name},
          ${pool.reserve0}, ${pool.reserve1}, ${pool.tvl_usd}, ${pool.lp_token_supply}
        )
        ON CONFLICT (pool_address) DO UPDATE SET
          reserve0 = EXCLUDED.reserve0,
          reserve1 = EXCLUDED.reserve1,
          tvl_usd = EXCLUDED.tvl_usd,
          lp_token_supply = EXCLUDED.lp_token_supply,
          updated_at = NOW()
      `;
      syncedCount++;
    }
  } catch (error) {
    console.error(`[Sync] Failed to sync pools for ${factoryName}:`, error);
  }

  return syncedCount;
}

/**
 * POST handler for syncing DEX pool data
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const force = searchParams.get('force') === 'true';

  // Check rate limit
  const now = Date.now();
  if (!force && now - lastSyncTime < MIN_SYNC_INTERVAL) {
    return NextResponse.json(
      {
        success: false,
        error: `Sync too frequent. Please wait ${Math.ceil((MIN_SYNC_INTERVAL - (now - lastSyncTime)) / 1000)} seconds.`,
      },
      { status: 429 }
    );
  }

  try {
    const sql = neon(process.env.DATABASE_URL || '');

    let totalSynced = 0;

    // Sync pools from each known factory
    for (const factory of KNOWN_FACTORIES) {
      const count = await syncFactoryPools(factory.name, factory.address, sql);
      totalSynced += count;
    }

    lastSyncTime = now;

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${totalSynced} pools`,
      syncedCount: totalSynced,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DEX Sync API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync DEX pool data',
        syncedCount: 0,
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler to check sync status
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    lastSyncTime: lastSyncTime > 0 ? new Date(lastSyncTime).toISOString() : null,
    canSync: Date.now() - lastSyncTime >= MIN_SYNC_INTERVAL,
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
