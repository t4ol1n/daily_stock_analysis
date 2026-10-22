/**
 * Technical indicator calculations for stock charts.
 *
 * All functions accept arrays of numbers and return arrays of the same length
 * (with leading nulls where the indicator is not yet defined).
 */

export function calculateMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (ema === null) {
      // Seed with first value
      ema = values[i];
    } else {
      ema = (values[i] - ema) * multiplier + ema;
    }
    result.push(ema);
  }
  return result;
}

export type MACDResult = {
  dif: (number | null)[];
  dea: (number | null)[];
  macd: (number | null)[];
};

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const dif: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    dif.push(emaFast[i] - emaSlow[i]);
  }

  const dea = calculateEMA(dif, signalPeriod);
  const macd: (number | null)[] = dif.map((v, i) => 2 * (v - dea[i]));

  // The first (slowPeriod - 1) values are not meaningful
  const nullPad: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < slowPeriod - 1) {
      nullPad.push(null);
    }
  }

  return {
    dif: [...nullPad.slice(0, slowPeriod - 1), ...dif.slice(slowPeriod - 1)],
    dea: [...nullPad.slice(0, slowPeriod - 1), ...dea.slice(slowPeriod - 1)],
    macd: [...nullPad.slice(0, slowPeriod - 1), ...macd.slice(slowPeriod - 1)],
  };
}

export type KDJResult = {
  k: (number | null)[];
  d: (number | null)[];
  j: (number | null)[];
};

export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9,
  kSmooth = 3,
  dSmooth = 3,
): KDJResult {
  const len = closes.length;
  const rsv: (number | null)[] = [];

  for (let i = 0; i < len; i++) {
    if (i < period - 1) {
      rsv.push(null);
      continue;
    }
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > highest) highest = highs[j];
      if (lows[j] < lowest) lowest = lows[j];
    }
    if (highest === lowest) {
      rsv.push(50);
    } else {
      rsv.push(((closes[i] - lowest) / (highest - lowest)) * 100);
    }
  }

  // SMA smoothing (Chinese stock market convention): SMA(X, N, 1)
  // K_t = (1/kSmooth) * RSV_t + (1 - 1/kSmooth) * K_{t-1}
  const k: (number | null)[] = [];
  const d: (number | null)[] = [];
  const j: (number | null)[] = [];

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < len; i++) {
    if (rsv[i] === null) {
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }
    const kVal = (1 / kSmooth) * rsv[i]! + (1 - 1 / kSmooth) * prevK;
    const dVal = (1 / dSmooth) * kVal + (1 - 1 / dSmooth) * prevD;
    const jVal = 3 * kVal - 2 * dVal;
    k.push(kVal);
    d.push(dVal);
    j.push(jVal);
    prevK = kVal;
    prevD = dVal;
  }

  return { k, d, j };
}
