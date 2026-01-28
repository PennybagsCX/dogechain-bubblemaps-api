/**
 * GET /api/distribution
 *
 * Returns token distribution analysis including Gini coefficient and concentration bands.
 * Queries holder data from the database and calculates wealth concentration metrics.
 */

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

interface Wallet {
  address: string;
  balance?: number;
  label?: string;
}

interface ConcentrationBands {
  top1Pct: number;
  top5Pct: number;
  top10Pct: number;
  top25Pct: number;
}

interface DistributionBucket {
  label: string;
  minPct: number;
  maxPct: number;
  count: number;
  percentage: number;
}

interface DistributionAnalysis {
  giniCoefficient: number;
  concentrationBands: ConcentrationBands;
  totalHolders: number;
  isCentralized: boolean;
  distributionBuckets: DistributionBucket[];
}

interface DistributionResponse {
  analysis: DistributionAnalysis | null;
  cached: boolean;
  timestamp: string;
}

// Simple in-memory cache
const cache = new Map<string, { data: DistributionAnalysis; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes

/**
 * Calculate the Gini coefficient for a set of wallet balances
 */
function calculateGiniCoefficient(holders: Wallet[]): number {
  if (holders.length === 0) return 0;
  if (holders.length === 1) return 0;

  const balances = holders.map((w) => w.balance ?? 0).filter((b) => b > 0);

  if (balances.length === 0) return 0;

  const n = balances.length;
  const mean = balances.reduce((sum, b) => sum + b, 0) / n;

  if (mean === 0) return 0;

  // Calculate sum of absolute differences
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const bi = balances[i] ?? 0;
      const bj = balances[j] ?? 0;
      sumDiff += Math.abs(bi - bj);
    }
  }

  // Gini coefficient
  const gini = sumDiff / (2 * n * n * mean);

  return Math.min(1, Math.max(0, gini));
}

/**
 * Calculate concentration bands showing what percentage of supply
 * is held by the top X% of wallets
 */
function calculateConcentrationBands(holders: Wallet[]): ConcentrationBands {
  if (holders.length === 0) {
    return { top1Pct: 0, top5Pct: 0, top10Pct: 0, top25Pct: 0 };
  }

  const sorted = [...holders].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const totalSupply = sorted.reduce((sum, w) => sum + (w.balance ?? 0), 0);

  if (totalSupply === 0) {
    return { top1Pct: 0, top5Pct: 0, top10Pct: 0, top25Pct: 0 };
  }

  const n = sorted.length;

  const getTopPct = (percentile: number): number => {
    const count = Math.max(1, Math.ceil(n * percentile));
    const topHolders = sorted.slice(0, count);
    const topSupply = topHolders.reduce((sum, w) => sum + (w.balance ?? 0), 0);
    return (topSupply / totalSupply) * 100;
  };

  return {
    top1Pct: getTopPct(0.01),
    top5Pct: getTopPct(0.05),
    top10Pct: getTopPct(0.1),
    top25Pct: getTopPct(0.25),
  };
}

/**
 * Create distribution buckets for holder concentration visualization
 */
function getDistributionBuckets(holders: Wallet[]): DistributionBucket[] {
  if (holders.length === 0) return [];

  const sorted = [...holders].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const totalSupply = sorted.reduce((sum, w) => sum + (w.balance ?? 0), 0);

  if (totalSupply === 0) return [];

  const percentages = sorted.map((w) => ((w.balance ?? 0) / totalSupply) * 100);

  const bucketRanges = [
    { label: '>10%', min: 10, max: Infinity },
    { label: '5-10%', min: 5, max: 10 },
    { label: '1-5%', min: 1, max: 5 },
    { label: '0.1-1%', min: 0.1, max: 1 },
    { label: '0.01-0.1%', min: 0.01, max: 0.1 },
    { label: '<0.01%', min: 0, max: 0.01 },
  ];

  const buckets: DistributionBucket[] = bucketRanges.map((range) => {
    const holdersInBucket = percentages.filter(
      (p) => p >= range.min && (range.max === Infinity ? true : p < range.max)
    );

    const supplyInBucket = holdersInBucket.reduce(
      (sum, p) => sum + (totalSupply * p) / 100,
      0
    );

    return {
      label: range.label,
      minPct: range.min,
      maxPct: range.max === Infinity ? 100 : range.max,
      count: holdersInBucket.length,
      percentage: (supplyInBucket / totalSupply) * 100,
    };
  });

  return buckets;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    const useCache = searchParams.get('cache') !== 'false';

    if (!address) {
      return NextResponse.json(
        { error: 'Missing required parameter: address' },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = address.toLowerCase();
    if (useCache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        const response: DistributionResponse = {
          analysis: cached.data,
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
    }

    // Fetch holder data from database
    const sql = neon(process.env.DATABASE_URL || '');

    const holdersResult = await sql`
      SELECT
        address,
        balance,
        label
      FROM token_holders
      WHERE token_address = ${address.toLowerCase()}
      ORDER BY balance DESC
      LIMIT 1000
    `;

    const holders: Wallet[] = holdersResult.map((row: any) => ({
      address: row.address,
      balance: parseFloat(row.balance) || 0,
      label: row.label,
    }));

    if (holders.length === 0) {
      return NextResponse.json(
        {
          analysis: null,
          error: 'No holder data found for this token',
          cached: false,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Calculate distribution metrics
    const giniCoefficient = calculateGiniCoefficient(holders);
    const concentrationBands = calculateConcentrationBands(holders);
    const distributionBuckets = getDistributionBuckets(holders);
    const isCentralized = concentrationBands.top10Pct > 50;

    const analysis: DistributionAnalysis = {
      giniCoefficient,
      concentrationBands,
      totalHolders: holders.length,
      isCentralized,
      distributionBuckets,
    };

    // Update cache
    cache.set(cacheKey, {
      data: analysis,
      timestamp: Date.now(),
    });

    const response: DistributionResponse = {
      analysis,
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
    console.error('[Distribution API] Error:', error);

    return NextResponse.json(
      {
        analysis: null,
        error: 'Failed to fetch distribution data',
        cached: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
