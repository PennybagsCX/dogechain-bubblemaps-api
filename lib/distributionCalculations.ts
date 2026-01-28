/**
 * Distribution Calculations Utility
 *
 * Provides functions to calculate wealth concentration metrics including:
 * - Gini coefficient (measure of inequality)
 * - Concentration bands (top 1%, 5%, 10%, 25%)
 * - Distribution buckets for histogram visualization
 */

import { Wallet } from "../types";

/**
 * Calculate the Gini coefficient for a set of wallet balances
 *
 * The Gini coefficient is a measure of statistical dispersion intended to represent
 * income inequality or wealth inequality within a nation or a social group.
 *
 * Range: 0 to 1
 * - 0 = perfect equality (everyone has the same amount)
 * - 1 = maximal inequality (one person has everything)
 *
 * Formula based on mean difference:
 * G = Sum(|x_i - x_j|) / (2 * n^2 * mean)
 */
export function calculateGiniCoefficient(holders: Wallet[]): number {
  if (holders.length === 0) return 0;
  if (holders.length === 1) return 0;

  // Extract balances
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
export interface ConcentrationBands {
  top1Pct: number; // Supply held by top 1%
  top5Pct: number; // Supply held by top 5%
  top10Pct: number; // Supply held by top 10%
  top25Pct: number; // Supply held by top 25%
}

export function calculateConcentrationBands(holders: Wallet[]): ConcentrationBands {
  if (holders.length === 0) {
    return { top1Pct: 0, top5Pct: 0, top10Pct: 0, top25Pct: 0 };
  }

  // Sort by balance descending (already sorted from API)
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
 * Distribution bucket for histogram visualization
 */
export interface DistributionBucket {
  label: string; // e.g., "0.01-0.1%"
  minPct: number; // Minimum percentage in bucket
  maxPct: number; // Maximum percentage in bucket
  count: number; // Number of holders in this bucket
  percentage: number; // % of total supply in this bucket
}

/**
 * Create distribution buckets for holder concentration visualization
 * Buckets are defined by ownership percentage ranges
 */
export function getDistributionBuckets(holders: Wallet[]): DistributionBucket[] {
  if (holders.length === 0) return [];

  const sorted = [...holders].sort((a, b) => b.balance - a.balance);
  const totalSupply = sorted.reduce((sum, w) => sum + w.balance, 0);

  if (totalSupply === 0) return [];

  // Convert to percentages
  const percentages = sorted.map((w) => (w.balance / totalSupply) * 100);

  // Define bucket ranges (in percentage of total supply)
  const bucketRanges = [
    { label: ">10%", min: 10, max: Infinity },
    { label: "5-10%", min: 5, max: 10 },
    { label: "1-5%", min: 1, max: 5 },
    { label: "0.1-1%", min: 0.1, max: 1 },
    { label: "0.01-0.1%", min: 0.01, max: 0.1 },
    { label: "<0.01%", min: 0, max: 0.01 },
  ];

  const buckets: DistributionBucket[] = bucketRanges.map((range) => {
    const holdersInBucket = percentages.filter(
      (p) => p >= range.min && (range.max === Infinity ? true : p < range.max)
    );

    const supplyInBucket = holdersInBucket.reduce((sum, p) => sum + (totalSupply * p) / 100, 0);

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

/**
 * Calculate full distribution analysis
 */
export interface DistributionAnalysis {
  giniCoefficient: number;
  concentrationBands: ConcentrationBands;
  totalHolders: number;
  isCentralized: boolean; // true if top 10 owns >50%
  distributionBuckets: DistributionBucket[];
}

export function calculateDistributionAnalysis(holders: Wallet[]): DistributionAnalysis {
  const giniCoefficient = calculateGiniCoefficient(holders);
  const concentrationBands = calculateConcentrationBands(holders);
  const distributionBuckets = getDistributionBuckets(holders);

  // Consider centralized if top 10% owns more than 50%
  const isCentralized = concentrationBands.top10Pct > 50;

  return {
    giniCoefficient,
    concentrationBands,
    totalHolders: holders.length,
    isCentralized,
    distributionBuckets,
  };
}
