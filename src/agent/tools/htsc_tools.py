# -*- coding: utf-8 -*-
"""
HTSC (华泰证券 AI涨乐) Tools — wraps HT API calls as agent-callable tools.

Tools:
- htsc_diagnosis_stock: 获取华泰证券AI涨乐个股综合诊断
- htsc_market_insight: 获取华泰证券市场洞察分析
- htsc_query_indicator: 查询华泰证券金融指标数据

These tools require HT_APIKEY environment variable to be configured.
"""

import logging
from typing import Any, Dict, Optional

from src.agent.tools.execution import check_tool_execution
from src.agent.tools.registry import ToolParameter, ToolDefinition, ToolPolicy

logger = logging.getLogger(__name__)

_HTSC_POLICY = ToolPolicy.declared(
    read_only=True,
    side_effects=["network_read"],
    permissions=["market_data:read"],
    scope_dimensions=["stock"],
)

_ht_fetcher_singleton = None


def _get_ht_fetcher():
    """Return a module-level singleton HTFetcher instance."""
    global _ht_fetcher_singleton
    if _ht_fetcher_singleton is None:
        try:
            from data_provider.htsc_fetcher import HTFetcher
            fetcher = HTFetcher()
            if not fetcher.is_available():
                logger.warning("HTFetcher not available: API key not configured")
                return None
            _ht_fetcher_singleton = fetcher
        except Exception as e:
            logger.warning(f"Failed to initialize HTFetcher: {e}")
            return None
    return _ht_fetcher_singleton


def _normalize_stock_code(code: str) -> str:
    """Normalize stock code for HT API (e.g., '600519' -> '600519', 'SH600519' -> '600519')."""
    if not code:
        return ""
    code = code.strip().upper()
    # Remove market prefix if present
    for prefix in ("SH", "SZ", "BJ"):
        if code.startswith(prefix):
            code = code[len(prefix):]
            break
    return code


def htsc_diagnosis_stock(
    stock_code: str,
    stock_name: str = "",
) -> Dict[str, Any]:
    """
    获取华泰证券AI涨乐个股综合诊断分析。

    Args:
        stock_code: 股票代码 (如 '600519', 'SH600519')
        stock_name: 股票名称 (可选，用于提高查询准确性)

    Returns:
        包含诊断结果的字典，包括价格走势、资金流向、技术面分析等
    """
    # Check for duplicate execution
    dup, dup_result = check_tool_execution(
        tool_name="htsc_diagnosis_stock",
        stock_code=stock_code,
        check_interval_seconds=5,
    )
    if dup:
        return dup_result

    fetcher = _get_ht_fetcher()
    if fetcher is None:
        return {
            "success": False,
            "error": "HT_APIKEY not configured or HTFetcher unavailable",
            "stock_code": stock_code,
        }

    normalized_code = _normalize_stock_code(stock_code)
    if not normalized_code:
        return {
            "success": False,
            "error": f"Invalid stock code: {stock_code}",
            "stock_code": stock_code,
        }

    try:
        result = fetcher.diagnosis_stock(normalized_code, stock_name)
        if result.get("ok") and result.get("data"):
            return {
                "success": True,
                "stock_code": stock_code,
                "stock_name": stock_name,
                "source": "htsc_ai_zhangle",
                "diagnosis": result["data"],
            }
        else:
            error_msg = result.get("error", {}).get("message", "Unknown error")
            logger.warning(f"HT diagnosis failed for {stock_code}: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "stock_code": stock_code,
            }
    except Exception as e:
        logger.error(f"HT diagnosis error for {stock_code}: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "stock_code": stock_code,
        }


def htsc_market_insight(query: str) -> Dict[str, Any]:
    """
    获取华泰证券市场洞察分析。

    Args:
        query: 查询内容 (如 '今日市场总结', '板块轮动分析')

    Returns:
        包含市场洞察结果的字典
    """
    fetcher = _get_ht_fetcher()
    if fetcher is None:
        return {
            "success": False,
            "error": "HT_APIKEY not configured or HTFetcher unavailable",
        }

    if not query or not query.strip():
        return {
            "success": False,
            "error": "Query cannot be empty",
        }

    try:
        result = fetcher.market_insight(query)
        if result.get("ok") and result.get("data"):
            return {
                "success": True,
                "query": query,
                "source": "htsc_ai_zhangle",
                "insight": result["data"],
            }
        else:
            error_msg = result.get("error", {}).get("message", "Unknown error")
            logger.warning(f"HT market insight failed: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
            }
    except Exception as e:
        logger.error(f"HT market insight error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }


def htsc_query_indicator(query: str) -> Dict[str, Any]:
    """
    查询华泰证券金融指标数据。

    Args:
        query: 查询内容 (如 '华泰证券最新价', '贵州茅台收盘价')

    Returns:
        包含指标数据的字典
    """
    fetcher = _get_ht_fetcher()
    if fetcher is None:
        return {
            "success": False,
            "error": "HT_APIKEY not configured or HTFetcher unavailable",
        }

    if not query or not query.strip():
        return {
            "success": False,
            "error": "Query cannot be empty",
        }

    try:
        result = fetcher.query_indicator(query)
        if result.get("ok") and result.get("data"):
            return {
                "success": True,
                "query": query,
                "source": "htsc_ai_zhangle",
                "indicator": result["data"],
            }
        else:
            error_msg = result.get("error", {}).get("message", "Unknown error")
            logger.warning(f"HT query indicator failed: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
            }
    except Exception as e:
        logger.error(f"HT query indicator error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }


# Tool definitions for registration
HTSC_DIAGNOSIS_TOOL = ToolDefinition(
    name="htsc_diagnosis_stock",
    description="获取华泰证券AI涨乐个股综合诊断分析，包含价格走势、资金流向、技术面分析等权威数据。需要配置HT_APIKEY环境变量。",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="股票代码，如 '600519' 或 'SH600519'",
            required=True,
        ),
        ToolParameter(
            name="stock_name",
            type="string",
            description="股票名称（可选），如 '贵州茅台'，用于提高查询准确性",
            required=False,
        ),
    ],
    handler=htsc_diagnosis_stock,
    category="data",
    policy=_HTSC_POLICY,
    timeout_seconds=30.0,
)

HTSC_MARKET_INSIGHT_TOOL = ToolDefinition(
    name="htsc_market_insight",
    description="获取华泰证券市场洞察分析，包括市场总结、板块轮动、资金动向等。需要配置HT_APIKEY环境变量。",
    parameters=[
        ToolParameter(
            name="query",
            type="string",
            description="查询内容，如 '今日市场总结'、'板块轮动分析'",
            required=True,
        ),
    ],
    handler=htsc_market_insight,
    category="market",
    policy=_HTSC_POLICY,
    timeout_seconds=30.0,
)

HTSC_QUERY_INDICATOR_TOOL = ToolDefinition(
    name="htsc_query_indicator",
    description="查询华泰证券金融指标数据，如股票价格、涨跌幅等。需要配置HT_APIKEY环境变量。",
    parameters=[
        ToolParameter(
            name="query",
            type="string",
            description="查询内容，如 '华泰证券最新价'、'贵州茅台收盘价'",
            required=True,
        ),
    ],
    handler=htsc_query_indicator,
    category="data",
    policy=_HTSC_POLICY,
    timeout_seconds=30.0,
)

# Export all tools for registration
ALL_HTSC_TOOLS = [
    HTSC_DIAGNOSIS_TOOL,
    HTSC_MARKET_INSIGHT_TOOL,
    HTSC_QUERY_INDICATOR_TOOL,
]
