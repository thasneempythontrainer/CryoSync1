"""OpenAI-compatible AI tool-calling backend for the CryoSync agent.

Replaces the former Databricks Model Serving adapter with any OpenAI-compatible
chat API (OpenAI, a local vLLM/Ollama, Together, OpenRouter, etc.). Configure
with:

    OPENAI_API_KEY=...
    OPENAI_BASE_URL=https://api.openai.com/v1     # optional
    OPENAI_MODEL=gpt-4o-mini                       # optional

Because this talks straight to the raw HTTP endpoint (rather than the OpenAI
python SDK, which always appends /chat/completions), Databricks Model Serving
endpoints are also supported: set OPENAI_BASE_URL to
    https://<host>/serving-endpoints/<endpoint_name>/invocations
and OPENAI_MODEL to the endpoint name. Databricks' serving gateway only
accepts requests at the exact /invocations path.

The frontend's `{ messages, tools }` contract maps 1:1 to the OpenAI
function-calling format, so no frontend changes are needed.
"""

import json
import os
from typing import Any, Dict, List

import httpx

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def _api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "")


def _chat_url() -> str:
    base = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    if base.endswith("/invocations"):
        # Databricks model serving: the gateway serves the OpenAI request body
        # at exactly this path and rejects an extra /chat/completions suffix.
        return base
    return base + "/chat/completions"


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def get_model() -> str:
    return os.getenv("OPENAI_MODEL", DEFAULT_MODEL)


def _tool_def_to_openai(tool: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a frontend AgentToolDefinition into OpenAI tool format."""
    return {
        "type": "function",
        "function": {
            "name": tool["function"]["name"],
            "description": tool["function"].get("description", ""),
            "parameters": tool["function"].get("parameters", {}),
        },
    }


def _message_to_openai(msg: Dict[str, Any]) -> Dict[str, Any]:
    role = msg.get("role", "user")
    content = msg.get("content", "")

    if role == "system":
        return {"role": "system", "content": content}

    if role == "tool":
        return {"role": "tool", "tool_call_id": msg.get("tool_call_id", ""), "content": content}

    if role == "assistant":
        out: Dict[str, Any] = {"role": "assistant", "content": content}
        calls = msg.get("tool_calls")
        if calls:
            out["tool_calls"] = []
            for c in calls:
                out["tool_calls"].append({
                    "id": c["id"],
                    "type": "function",
                    "function": {
                        "name": c["name"],
                        "arguments": json.dumps(c.get("arguments", {})),
                    },
                })
        return out

    return {"role": "user", "content": content}


def _parse_tool_calls(tool_calls: Any) -> List[Dict[str, Any]]:
    """Parse OpenAI-style tool_calls from a chat completion response."""
    calls: List[Dict[str, Any]] = []
    if not tool_calls:
        return calls
    for tc in tool_calls:
        try:
            args = json.loads(tc.get("function", {}).get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        calls.append({
            "id": tc.get("id"),
            "name": tc.get("function", {}).get("name"),
            "arguments": args,
        })
    return calls


async def run_agent_chat(messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Single AI agent turn against an OpenAI-compatible chat API.

    Returns a dict shaped like the frontend's AgentResponse:
      {"content": str, "tool_calls": [...] }
    The tool_calls, when present, are executed by the frontend, which posts the
    results back here on the next call.
    """
    if not _api_key():
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Configure it in backend/.env (see .env.example)."
        )

    body: Dict[str, Any] = {
        "model": get_model(),
        "messages": [_message_to_openai(m) for m in messages],
    }
    oa_tools = [_tool_def_to_openai(t) for t in tools] if tools else None
    if oa_tools:
        body["tools"] = oa_tools

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(_chat_url(), headers=_headers(), json=body)
    except httpx.HTTPError as e:
        raise RuntimeError(f"AI backend connection error: {e}") from e

    if resp.status_code >= 400:
        raise RuntimeError(f"Error code: {resp.status_code} - {resp.text[:600]}")

    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message", {})
    assistant_content = message.get("content") or ""
    tool_calls = _parse_tool_calls(message.get("tool_calls"))

    return {"content": assistant_content, "tool_calls": tool_calls}