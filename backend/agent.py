"""Databricks Foundation Model API tool-calling backend for the CryoSync agent.

Exposes a thin adapter over the OpenAI-compatible endpoint of Databricks
Model Serving so the frontend's `{ messages, tools }` contract maps 1:1.

Authentication is shared via `databricks_auth` (see there): a static token
via DATABRICKS_TOKEN, or automatic machine-to-machine OAuth that refreshes
before expiry - no manual token rotation required.
"""

import json
import os
from typing import Any, Dict, List

from openai import OpenAI

from databricks_auth import get_bearer_token, workspace_host

DEFAULT_ENDPOINT = "databricks-meta-llama-3-3-70b-instruct"

_client: OpenAI | None = None

# Backwards-compatible alias for callers that import get_databricks_token from agent.
get_databricks_token = get_bearer_token


def _get_client(api_key: str) -> OpenAI:
    global _client
    base_url = os.getenv(
        "DATABRICKS_BASE_URL",
        f"https://{workspace_host()}/serving-endpoints",
    )
    if _client is None or _client.api_key != api_key:
        _client = OpenAI(api_key=api_key, base_url=base_url)
    return _client


def get_model() -> str:
    return os.getenv("DATABRICKS_ENDPOINT", DEFAULT_ENDPOINT)


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
                tc: Dict[str, Any] = {
                    "id": c["id"],
                    "type": "function",
                    "function": {
                        "name": c["name"],
                        "arguments": json.dumps(c.get("arguments", {})),
                    },
                }
                # Gemini 3 thinking models require the thought_signature to be
                # echoed back on every assistant tool-call round trip.
                sig = c.get("thought_signature")
                if not sig:
                    extra = c.get("extra_content") or {}
                    sig = (extra.get("google") or {}).get("thought_signature")
                if sig:
                    tc["extra_content"] = {"google": {"thought_signature": sig}}
                out["tool_calls"].append(tc)
        return out

    return {"role": "user", "content": content}


def _parse_tool_calls(response: Any) -> List[Dict[str, Any]]:
    """Parse OpenAI-style tool_calls from a Gemini (OpenAI-compat) response."""
    calls: List[Dict[str, Any]] = []
    message = getattr(response.choices[0].message, "tool_calls", None)
    if not message:
        return calls

    for tc in message:
        try:
            args = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError:
            args = {}
        call: Dict[str, Any] = {
            "id": tc.id,
            "name": tc.function.name,
            "arguments": args,
        }
        extra = getattr(tc, "extra_content", None) or {}
        google = extra.get("google", {}) if isinstance(extra, dict) else {}
        sig = google.get("thought_signature")
        if sig:
            call["thought_signature"] = sig
        calls.append(call)
    return calls


async def run_agent_chat(messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Single agent turn against Databricks Model Serving via its OpenAI-compatible endpoint.

    Returns a dict shaped like the frontend's AgentResponse:
      {"content": str, "tool_calls": [...] }
    The tool_calls, when present, are executed by the frontend, which posts the
    results back here on the next call.
    """
    client = _get_client(await get_databricks_token())

    oa_messages = [_message_to_openai(m) for m in messages]
    oa_tools = [_tool_def_to_openai(t) for t in tools] if tools else None

    kwargs: Dict[str, Any] = {
        "model": get_model(),
        "messages": oa_messages,
    }
    if oa_tools:
        kwargs["tools"] = oa_tools

    resp = client.chat.completions.create(**kwargs)

    assistant_content = resp.choices[0].message.content or ""
    tool_calls = _parse_tool_calls(resp)

    return {"content": assistant_content, "tool_calls": tool_calls}