import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPage, Button, InlineAlert } from '../components/common';
import KLineChart from '../components/stock/KLineChart';
import { ReportSummary } from '../components/report/ReportSummary';
import { stockDataApi, type KLineData, type StockQuoteData } from '../api/stockData';
import { analysisApi } from '../api/analysis';
import { toApiErrorMessage } from '../api/error';
import type { AnalysisResult, TaskAccepted, TaskStatus } from '../types/analysis';

const POLL_INTERVAL_MS = 3000;

const StockAnalysisPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const stockCode = code ?? '';

  const [quote, setQuote] = useState<StockQuoteData | null>(null);
  const [historyData, setHistoryData] = useState<KLineData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisTaskId, setAnalysisTaskId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState('');

  // Load quote and history
  useEffect(() => {
    if (!stockCode) return;
    let cancelled = false;

    const load = async () => {
      setLoadingData(true);
      setDataError('');
      try {
        const [quoteResult, historyResult] = await Promise.allSettled([
          stockDataApi.getQuote(stockCode),
          stockDataApi.getHistory(stockCode, { days: 250 }),
        ]);

        if (cancelled) return;

        if (quoteResult.status === 'fulfilled') {
          setQuote(quoteResult.value);
        }

        if (historyResult.status === 'fulfilled' && historyResult.value.data.length > 0) {
          setHistoryData(historyResult.value.data);
        } else if (historyResult.status === 'rejected') {
          setDataError('历史行情数据加载失败');
        }
      } catch (err) {
        if (!cancelled) {
          setDataError(toApiErrorMessage(err, '数据加载失败'));
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [stockCode]);

  // Poll analysis task status
  useEffect(() => {
    if (!analysisTaskId) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout>;

    const poll = async () => {
      try {
        const status: TaskStatus = await analysisApi.getStatus(analysisTaskId);
        if (cancelled) return;

        setAnalysisProgress(status.status || '');

        if (status.status === 'completed' && status.result) {
          setAnalysisResult(status.result);
          setAnalysisTaskId(null);
          setAnalyzing(false);
          return;
        }
        if (status.status === 'failed') {
          setAnalysisError(status.error || '分析任务失败');
          setAnalysisTaskId(null);
          setAnalyzing(false);
          return;
        }
        // Still running
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) {
          setAnalysisError(toApiErrorMessage(err, '分析状态查询失败'));
          setAnalysisTaskId(null);
          setAnalyzing(false);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [analysisTaskId]);

  const handleAnalyze = useCallback(async () => {
    if (!stockCode) return;
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);
    setAnalysisProgress('正在提交分析任务...');

    try {
      const response = await analysisApi.analyze({
        stockCode,
        asyncMode: true,
      });

      if ('taskId' in response && response.taskId) {
        setAnalysisTaskId((response as TaskAccepted).taskId);
      } else if ('report' in response && response.report) {
        // Sync mode returned immediately
        setAnalysisResult({
          queryId: '',
          stockCode,
          stockName: quote?.stockName || stockCode,
          report: response.report,
          createdAt: new Date().toISOString(),
        });
        setAnalyzing(false);
      }
    } catch (err) {
      setAnalysisError(toApiErrorMessage(err, '分析请求失败'));
      setAnalyzing(false);
    }
  }, [stockCode, quote]);

  const priceChange = quote?.changePercent;
  const isUp = priceChange != null && priceChange >= 0;

  return (
    <AppPage className="max-w-6xl space-y-5 pb-12 pt-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-secondary-text">
        <Link
          to="/screening"
          className="inline-flex items-center gap-1 text-cyan transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回选股
        </Link>
        <span>/</span>
        <span className="text-foreground">{stockCode}</span>
      </div>

      {/* Stock info header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-cyan/10 text-cyan">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {quote?.stockName || stockCode}
              {quote?.stockName ? (
                <span className="ml-2 text-sm font-normal text-secondary-text">{stockCode}</span>
              ) : null}
            </h1>
            {quote ? (
              <div className="mt-0.5 flex items-center gap-3 text-sm">
                <span className={`text-lg font-bold ${isUp ? 'text-red-500' : 'text-green-500'}`}>
                  {quote.currentPrice.toFixed(2)}
                </span>
                {quote.change != null ? (
                  <span className={isUp ? 'text-red-500' : 'text-green-500'}>
                    {isUp ? '+' : ''}{quote.change.toFixed(2)}
                    {' '}
                    ({isUp ? '+' : ''}{priceChange?.toFixed(2)}%)
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <Button
          className="min-w-[140px]"
          isLoading={analyzing}
          loadingText="分析中..."
          disabled={analyzing || !stockCode}
          onClick={() => void handleAnalyze()}
        >
          <Sparkles className="h-4 w-4" />
          AI 分析
        </Button>
      </div>

      {/* Data error */}
      {dataError ? (
        <InlineAlert variant="warning" title="数据加载异常" message={dataError} />
      ) : null}

      {/* Analysis error */}
      {analysisError ? (
        <InlineAlert variant="danger" title="分析失败" message={analysisError} />
      ) : null}

      {/* Analysis progress */}
      {analyzing && analysisProgress ? (
        <div className="flex items-center gap-2 rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-2.5 text-sm text-cyan">
          <Loader2 className="h-4 w-4 animate-spin" />
          {analysisProgress}
        </div>
      ) : null}

      {/* K-line chart */}
      {loadingData ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card/95 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-cyan" />
          <span className="ml-2 text-sm text-secondary-text">加载行情数据...</span>
        </div>
      ) : historyData.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card/95 p-3 shadow-soft-card">
          <KLineChart data={historyData} stockName={quote?.stockName} />
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/95 py-16 text-center">
          <p className="text-sm text-secondary-text">暂无K线数据</p>
        </div>
      )}

      {/* Analysis result */}
      {analysisResult ? (
        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-soft-card">
          <h2 className="mb-4 text-base font-semibold text-foreground">分析报告</h2>
          <ReportSummary data={analysisResult} />
        </section>
      ) : null}
    </AppPage>
  );
};

export default StockAnalysisPage;
