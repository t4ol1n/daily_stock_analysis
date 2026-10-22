import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import type { KLineData } from '../../api/stockData';
import {
  calculateMA,
  calculateMACD,
  calculateKDJ,
} from '../../utils/technicalIndicators';

type KLineChartProps = {
  data: KLineData[];
  stockName?: string | null;
};

type MAConfig = {
  period: number;
  color: string;
  label: string;
};

const MA_CONFIGS: MAConfig[] = [
  { period: 5, color: '#e6c84e', label: 'MA5' },
  { period: 10, color: '#a78bfa', label: 'MA10' },
  { period: 20, color: '#22d3ee', label: 'MA20' },
  { period: 60, color: '#f97316', label: 'MA60' },
  { period: 120, color: '#94a3b8', label: 'MA120' },
];

const TIME_RANGES = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 132 },
  { label: '1Y', days: 250 },
  { label: '全部', days: 0 },
] as const;

const CHART_BG = '#0f1724';
const GRID_COLOR = '#1e293b';
const TEXT_COLOR = '#94a3b8';
const BORDER_COLOR = '#1e293b';
const CROSSHAIR_COLOR = '#475569';

function toChartTime(dateStr: string): Time {
  return dateStr as Time;
}

const KLineChart: React.FC<KLineChartProps> = ({ data, stockName }) => {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);
  const kdjChartRef = useRef<HTMLDivElement>(null);

  const chartApis = useRef<{
    main: IChartApi | null;
    macd: IChartApi | null;
    kdj: IChartApi | null;
  }>({ main: null, macd: null, kdj: null });

  const seriesRefs = useRef<{
    candle: ISeriesApi<SeriesType> | null;
    maLines: Map<number, ISeriesApi<SeriesType>>;
    macdHist: ISeriesApi<SeriesType> | null;
    difLine: ISeriesApi<SeriesType> | null;
    deaLine: ISeriesApi<SeriesType> | null;
    kLine: ISeriesApi<SeriesType> | null;
    dLine: ISeriesApi<SeriesType> | null;
    jLine: ISeriesApi<SeriesType> | null;
  }>({
    candle: null,
    maLines: new Map(),
    macdHist: null,
    difLine: null,
    deaLine: null,
    kLine: null,
    dLine: null,
    jLine: null,
  });

  const [activeRange, setActiveRange] = useState('1Y');
  const [visibleMAs, setVisibleMAs] = useState<Set<number>>(
    () => new Set([5, 10, 20, 60]),
  );
  const [hoverData, setHoverData] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number | null;
    maValues: Record<number, number | null>;
  } | null>(null);

  const isSyncing = useRef(false);

  const filteredData = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.label === activeRange);
    if (!range || range.days === 0) return data;
    return data.slice(-range.days);
  }, [data, activeRange]);

  const closes = useMemo(() => filteredData.map((d) => d.close), [filteredData]);
  const highs = useMemo(() => filteredData.map((d) => d.high), [filteredData]);
  const lows = useMemo(() => filteredData.map((d) => d.low), [filteredData]);

  const macdData = useMemo(() => calculateMACD(closes), [closes]);
  const kdjData = useMemo(() => calculateKDJ(highs, lows, closes), [highs, lows, closes]);

  const maData = useMemo(() => {
    const result: Record<number, (number | null)[]> = {};
    for (const cfg of MA_CONFIGS) {
      result[cfg.period] = calculateMA(closes, cfg.period);
    }
    return result;
  }, [closes]);

  const toggleMA = useCallback((period: number) => {
    setVisibleMAs((prev) => {
      const next = new Set(prev);
      if (next.has(period)) {
        next.delete(period);
      } else {
        next.add(period);
      }
      return next;
    });
  }, []);

  // Build hover data for legend
  const buildHoverData = useCallback(
    (dateStr: string) => {
      const idx = filteredData.findIndex((d) => d.date === dateStr);
      if (idx < 0) return null;
      const item = filteredData[idx];
      const maValues: Record<number, number | null> = {};
      for (const cfg of MA_CONFIGS) {
        maValues[cfg.period] = maData[cfg.period]?.[idx] ?? null;
      }
      return {
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        maValues,
      };
    },
    [filteredData, maData],
  );

  // Initialize charts (runs once when container + data are ready)
  useEffect(() => {
    if (!mainChartRef.current || !macdChartRef.current || !kdjChartRef.current) return;
    if (filteredData.length === 0) return;

    const commonOptions = {
      layout: {
        background: { color: CHART_BG },
        textColor: TEXT_COLOR,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR_COLOR, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: '#334155' },
        horzLine: { color: CROSSHAIR_COLOR, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: '#334155' },
      },
      timeScale: {
        borderColor: BORDER_COLOR,
        timeVisible: false,
        rightOffset: 5,
        barSpacing: 6,
      },
      rightPriceScale: {
        borderColor: BORDER_COLOR,
      },
      handleScroll: { vertTouchDrag: false },
    };

    // --- Main chart ---
    const mainChart = createChart(mainChartRef.current, {
      ...commonOptions,
      height: 380,
    });
    chartApis.current.main = mainChart;

    const candle = mainChart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderUpColor: '#ef4444',
      borderDownColor: '#22c55e',
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
    });
    seriesRefs.current.candle = candle;

    for (const cfg of MA_CONFIGS) {
      const maLine = mainChart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRefs.current.maLines.set(cfg.period, maLine);
    }

    // --- MACD chart ---
    const macdChart = createChart(macdChartRef.current, {
      ...commonOptions,
      height: 140,
    });
    chartApis.current.macd = macdChart;

    const macdHist = macdChart.addSeries(HistogramSeries, {
      color: '#64748b',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.macdHist = macdHist;

    const difLine = macdChart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.difLine = difLine;

    const deaLine = macdChart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.deaLine = deaLine;

    // --- KDJ chart ---
    const kdjChart = createChart(kdjChartRef.current, {
      ...commonOptions,
      height: 140,
    });
    chartApis.current.kdj = kdjChart;

    const kLine = kdjChart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.kLine = kLine;

    const dLine = kdjChart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.dLine = dLine;

    const jLine = kdjChart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRefs.current.jLine = jLine;

    // Crosshair sync
    const handleMainCrosshair = (param: MouseEventParams) => {
      if (param.time) {
        setHoverData(buildHoverData(param.time as string));
      } else {
        setHoverData(null);
      }
      if (isSyncing.current) return;
      isSyncing.current = true;
      macdChart.clearCrosshairPosition();
      kdjChart.clearCrosshairPosition();
      isSyncing.current = false;
    };
    const handleMacdCrosshair = () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      mainChart.clearCrosshairPosition();
      kdjChart.clearCrosshairPosition();
      isSyncing.current = false;
    };
    const handleKdjCrosshair = () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      mainChart.clearCrosshairPosition();
      macdChart.clearCrosshairPosition();
      isSyncing.current = false;
    };

    mainChart.subscribeCrosshairMove(handleMainCrosshair);
    macdChart.subscribeCrosshairMove(handleMacdCrosshair);
    kdjChart.subscribeCrosshairMove(handleKdjCrosshair);

    return () => {
      mainChart.unsubscribeCrosshairMove(handleMainCrosshair);
      macdChart.unsubscribeCrosshairMove(handleMacdCrosshair);
      kdjChart.unsubscribeCrosshairMove(handleKdjCrosshair);
      mainChart.remove();
      macdChart.remove();
      kdjChart.remove();
      chartApis.current = { main: null, macd: null, kdj: null };
      seriesRefs.current = {
        candle: null,
        maLines: new Map(),
        macdHist: null,
        difLine: null,
        deaLine: null,
        kLine: null,
        dLine: null,
        jLine: null,
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredData.length]);

  // Update chart data when data or indicators change
  useEffect(() => {
    const { candle, maLines, macdHist, difLine, deaLine, kLine, dLine, jLine } = seriesRefs.current;
    const mainChart = chartApis.current.main;
    const macdChart = chartApis.current.macd;
    const kdjChart = chartApis.current.kdj;
    if (!candle || !mainChart || !macdChart || !kdjChart) return;

    // Candlestick data
    candle.setData(
      filteredData.map((d) => ({
        time: toChartTime(d.date),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    );

    // MA lines
    for (const cfg of MA_CONFIGS) {
      const series = maLines.get(cfg.period);
      if (!series) continue;
      if (!visibleMAs.has(cfg.period)) {
        series.setData([]);
        continue;
      }
      const values = maData[cfg.period];
      const lineData = values
        .map((v, i) =>
          v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null,
        )
        .filter((d): d is { time: Time; value: number } => d !== null);
      series.setData(lineData);
    }

    // MACD
    if (macdHist && difLine && deaLine) {
      const histData = macdData.macd
        .map((v, i) =>
          v !== null
            ? { time: toChartTime(filteredData[i].date), value: v, color: v >= 0 ? '#ef4444' : '#22c55e' }
            : null,
        )
        .filter((d): d is { time: Time; value: number; color: string } => d !== null);

      const difData = macdData.dif
        .map((v, i) => (v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null))
        .filter((d): d is { time: Time; value: number } => d !== null);

      const deaData = macdData.dea
        .map((v, i) => (v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null))
        .filter((d): d is { time: Time; value: number } => d !== null);

      macdHist.setData(histData);
      difLine.setData(difData);
      deaLine.setData(deaData);
    }

    // KDJ
    if (kLine && dLine && jLine) {
      const kData = kdjData.k
        .map((v, i) => (v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null))
        .filter((d): d is { time: Time; value: number } => d !== null);

      const dData = kdjData.d
        .map((v, i) => (v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null))
        .filter((d): d is { time: Time; value: number } => d !== null);

      const jData = kdjData.j
        .map((v, i) => (v !== null ? { time: toChartTime(filteredData[i].date), value: v } : null))
        .filter((d): d is { time: Time; value: number } => d !== null);

      kLine.setData(kData);
      dLine.setData(dData);
      jLine.setData(jData);
    }

    mainChart.timeScale().fitContent();
    macdChart.timeScale().fitContent();
    kdjChart.timeScale().fitContent();
  }, [filteredData, maData, macdData, kdjData, visibleMAs]);

  const displayData =
    hoverData ?? (filteredData.length > 0 ? buildHoverData(filteredData[filteredData.length - 1].date) : null);

  return (
    <div className="space-y-1">
      {/* Header: stock name + MA legend + time range */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3">
          {stockName ? (
            <span className="text-sm font-semibold text-foreground">{stockName}</span>
          ) : null}
          {MA_CONFIGS.map((cfg) => (
            <button
              key={cfg.period}
              type="button"
              className={`flex items-center gap-1 text-xs transition-opacity ${
                visibleMAs.has(cfg.period) ? 'opacity-100' : 'opacity-35'
              }`}
              onClick={() => toggleMA(cfg.period)}
            >
              <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: cfg.color }} />
              <span style={{ color: cfg.color }}>{cfg.label}</span>
              {displayData?.maValues?.[cfg.period] != null ? (
                <span className="text-secondary-text">{displayData.maValues[cfg.period]?.toFixed(2)}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.label}
              type="button"
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                activeRange === range.label
                  ? 'bg-cyan/15 font-semibold text-cyan'
                  : 'text-secondary-text hover:text-foreground'
              }`}
              onClick={() => setActiveRange(range.label)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* OHLCV hover info */}
      {displayData ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-1 py-1 text-xs">
          <span className="text-secondary-text">{displayData.date}</span>
          <span>
            开 <span className="font-medium text-foreground">{displayData.open.toFixed(2)}</span>
          </span>
          <span>
            高 <span className="font-medium text-foreground">{displayData.high.toFixed(2)}</span>
          </span>
          <span>
            低 <span className="font-medium text-foreground">{displayData.low.toFixed(2)}</span>
          </span>
          <span>
            收{' '}
            <span
              className={`font-medium ${
                displayData.close >= displayData.open ? 'text-red-500' : 'text-green-500'
              }`}
            >
              {displayData.close.toFixed(2)}
            </span>
          </span>
          {displayData.volume != null ? (
            <span>
              量{' '}
              <span className="font-medium text-foreground">
                {displayData.volume >= 100000000
                  ? `${(displayData.volume / 100000000).toFixed(2)}亿`
                  : displayData.volume >= 10000
                    ? `${(displayData.volume / 10000).toFixed(0)}万`
                    : displayData.volume.toFixed(0)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Main chart */}
      <div ref={mainChartRef} className="w-full overflow-hidden rounded-lg border border-border/60" />

      {/* MACD panel */}
      <div className="relative">
        <span className="absolute left-2 top-1 z-10 text-[10px] font-semibold text-secondary-text">
          MACD(12,26,9)
        </span>
        <div ref={macdChartRef} className="w-full overflow-hidden rounded-lg border border-border/60" />
      </div>

      {/* KDJ panel */}
      <div className="relative">
        <span className="absolute left-2 top-1 z-10 text-[10px] font-semibold text-secondary-text">
          KDJ(9,3,3)
        </span>
        <div ref={kdjChartRef} className="w-full overflow-hidden rounded-lg border border-border/60" />
      </div>
    </div>
  );
};

export default KLineChart;
