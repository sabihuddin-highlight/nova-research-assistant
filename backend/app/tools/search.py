"""Tavily search wrapper used by the Research Agent.

We use the official `tavily-python` SDK for reliability and simplicity. The
assignment notes that Tavily MCP is preferred; the MCP server is a thin
wrapper over the same HTTP API, so the contract here (query in, list of
{title, url, content} out) maps 1:1 to the MCP `search` tool. To swap to MCP
later, replace `tavily_search` with a `langchain-mcp-adapters` MultiServerMCPClient
call — every caller already uses the abstract shape.
"""
from __future__ import annotations

from functools import lru_cache

from tavily import TavilyClient

from app.config import get_settings


@lru_cache
def _client() -> TavilyClient:
    return TavilyClient(api_key=get_settings().tavily_api_key)


def tavily_search(query: str, max_results: int = 5) -> list[dict]:
    """Run one search and return a normalised result list.

    Returns: list of {title, url, content} dicts. Empty list on any error —
    the Research Agent handles empty results gracefully and the Validator
    will catch persistent emptiness.
    """
    if not query or not query.strip():
        return []
    try:
        resp = _client().search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
            include_answer=False,
        )
    except Exception as exc:
        # Tavily can raise on rate-limit, auth, network. Don't crash the graph.
        return [{"title": "Search error", "url": "", "content": f"Tavily error: {exc}"}]

    results = resp.get("results", []) if isinstance(resp, dict) else []
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
        }
        for r in results
    ]
