import apiClient from './index';
import { toCamelCase } from './utils';

export type KLineData = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  amount?: number | null;
  changePercent?: number | null;
};

export type StockHistoryResponse = {
  stockCode: string;
  stockName?: string | null;
  period: string;
  data: KLineData[];
};

export type StockQuoteData = {
  stockCode: string;
  stockName?: string | null;
  currentPrice: number;
  change?: number | null;
  changePercent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
  amount?: number | null;
  updateTime?: string | null;
};

export const stockDataApi = {
  async getHistory(
    stockCode: string,
    options: { period?: string; days?: number } = {},
  ): Promise<StockHistoryResponse> {
    const { period = 'daily', days = 250 } = options;
    const response = await apiClient.get<Record<string, unknown>>(
      `/api/v1/stocks/${encodeURIComponent(stockCode)}/history`,
      { params: { period, days } },
    );
    return toCamelCase<StockHistoryResponse>(response.data);
  },

  async getQuote(stockCode: string): Promise<StockQuoteData> {
    const response = await apiClient.get<Record<string, unknown>>(
      `/api/v1/stocks/${encodeURIComponent(stockCode)}/quote`,
    );
    return toCamelCase<StockQuoteData>(response.data);
  },
};
