# -*- coding: utf-8 -*-
"""
华泰证券 AI涨乐 数据源

基于华泰证券 OpenClaw Skills 提供的金融数据分析能力：
- query-indicator: 金融指标与行情综合检索
- financial-analysis: 金融分析与资讯查询（个股诊断、市场洞察）

配置：
- HT_APIKEY: 环境变量或 ~/.htsc-skills/config 文件
- HT_SERVICE_URL: 服务地址，默认 https://ai.zhangle.com
"""

import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)


def _load_ht_config() -> Dict[str, str]:
    """Load HT API configuration from environment and config file."""
    config = {}
    
    # Load from config file
    config_path = Path.home() / ".htsc-skills" / "config"
    if config_path.exists():
        # Use utf-8-sig to strip BOM if present
        for line in config_path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            config[key.strip()] = value.strip()
    
    # Environment variables override config file (only if env var is set and non-empty)
    env_apikey = os.environ.get("HT_APIKEY", "")
    if env_apikey:
        config["HT_APIKEY"] = env_apikey
    env_service_url = os.environ.get("HT_SERVICE_URL", "")
    if env_service_url:
        config["HT_SERVICE_URL"] = env_service_url
    
    return config


class HTFetcher:
    """华泰证券 AI涨乐 数据获取器"""
    
    def __init__(self):
        self.config = _load_ht_config()
        self.api_key = self.config.get("HT_APIKEY", "")
        self.service_url = self.config.get("HT_SERVICE_URL", "https://ai.zhangle.com")
        self.base_path = "/edge/entry/gate"
        self.timeout = 60.0
        
        if not self.api_key:
            logger.warning("HT_APIKEY not configured. HT skills will be unavailable.")
    
    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """Make POST request to HT API."""
        if not self.api_key:
            return {"ok": False, "error": {"message": "HT_APIKEY not configured"}}
        
        # URL: service_url + base_path + path
        url = f"{self.service_url.rstrip('/')}{self.base_path}{path}"
        headers = {
            "apiKey": self.api_key,
            "skillCode": "mx_1779096185749",
            "Content-Type": "application/json",
        }
        
        try:
            resp = requests.post(url, json=body, headers=headers, timeout=self.timeout)
            resp.encoding = "utf-8"
            resp.raise_for_status()
            result = resp.json()
            
            if result.get("code") != 0:
                return {
                    "ok": False,
                    "error": {
                        "code": result.get("code"),
                        "message": result.get("message", "Unknown error"),
                    }
                }
            
            return {"ok": True, "data": result.get("data")}
            
        except requests.exceptions.Timeout:
            return {"ok": False, "error": {"message": "Request timeout"}}
        except requests.exceptions.ConnectionError:
            return {"ok": False, "error": {"message": "Connection failed"}}
        except Exception as e:
            return {"ok": False, "error": {"message": str(e)}}
    
    def query_indicator(self, query: str) -> Dict[str, Any]:
        """
        金融指标与行情综合检索
        
        Args:
            query: 自然语言查询，如 "华泰证券最新价"
        
        Returns:
            {"ok": bool, "data": {"answer": str}}
        """
        return self._post(
            "/api/finAnalysis/marketInsight",
            {"query": query}
        )
    
    def diagnosis_stock(self, stock_code: str, stock_name: str = "") -> Dict[str, Any]:
        """
        个股分析诊断
        
        Args:
            stock_code: 股票代码，如 "601688"
            stock_name: 股票名称（可选）
        
        Returns:
            {"ok": bool, "data": {"answer": str}}
        """
        query = f"{stock_name or stock_code} 综合分析诊断"
        return self._post(
            "/api/finAnalysis/diagnosisStock",
            {"query": query}
        )
    
    def market_insight(self, query: str) -> Dict[str, Any]:
        """
        市场洞察分析
        
        Args:
            query: 自然语言查询，如 "今天大盘怎么样"
        
        Returns:
            {"ok": bool, "data": {"answer": str}}
        """
        return self._post(
            "/api/finAnalysis/marketInsight",
            {"query": query}
        )
    
    def select_stock(self, query: str) -> Dict[str, Any]:
        """
        条件选股
        
        Args:
            query: 自然语言查询，如 "科技板块上周涨幅前10的股票"
        
        Returns:
            {"ok": bool, "data": {"answer": str}}
        """
        return self._post(
            "/api/finAnalysis/marketInsight",
            {"query": query}
        )
    
    def is_available(self) -> bool:
        """Check if HT API is available."""
        return bool(self.api_key)


# Singleton instance
_ht_fetcher: Optional[HTFetcher] = None


def get_ht_fetcher() -> HTFetcher:
    """Get or create HTFetcher singleton."""
    global _ht_fetcher
    if _ht_fetcher is None:
        _ht_fetcher = HTFetcher()
    return _ht_fetcher


if __name__ == "__main__":
    # Quick test
    fetcher = get_ht_fetcher()
    print(f"HT API Key configured: {bool(fetcher.api_key)}")
    print(f"Service URL: {fetcher.service_url}")
    
    if fetcher.is_available():
        result = fetcher.query_indicator("华泰证券最新价")
        print(f"Test query result: {result}")
