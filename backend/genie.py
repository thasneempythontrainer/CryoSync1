"""Databricks Genie Spaces integration for the CryoSync Kyra agent.

Lets Kyra ask natural-language data questions over the CryoSync lakehouse by
delegating to a real Databricks Genie space instead of hand-writing SQL.
Configure in backend/.env:

    GENIE_SPACE_ID=<space_id>           # from the Genie space URL / API
    DATABRICKS_HOST=https://...         # already present
    DATABRICKS_TOKEN=dapi...            # already present

Flow per question:
  1. Start (or continue) a conversation in the Genie space.
  2. Create a message with the user's question.
  3. Poll GET message until COMPLETED / FAILED.
  4. Extract the AI text answer, the generated SQL, and (when present) the
     query result rows so Kyra can summarize or chart them.
"""

import asyncio
import os
from typing import Any, Dict, List, Optional

import httpx

HOST = os.getenv("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.getenv("DATABRICKS_TOKEN", "")
SPACE_ID = os.getenv("GENIE_SPACE_ID", "")

POLL_INTERVAL_S = 2.0
POLL_MAX_ATTEMPTS = 120  # ~4 minutes of wall-clock time
QUERY_RESULT_ROW_CAP = 100
QUERY_RESULT_CHUNK_CAP = 10

_ANSWER_PURPOSE = "TEXT_ATTACHMENT_PURPOSE_ANSWER"
_TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}

# Maps a caller thread id -> active Genie conversation id so follow-up
# questions in the same chat keep Genie's conversation context.
_conversation_cache: Dict[str, str] = {}


class GenieConfigError(RuntimeError):
    pass


class GenieError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(HOST and TOKEN and SPACE_ID)


def set_conversation(thread_id: str, conversation_id: Optional[str]) -> None:
    if not thread_id:
        return
    if conversation_id:
        _conversation_cache[thread_id] = conversation_id
    else:
        _conversation_cache.pop(thread_id, None)


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def _require_configured() -> None:
    missing = []
    if not HOST:
        missing.append("DATABRICKS_HOST")
    if not TOKEN:
        missing.append("DATABRICKS_TOKEN")
    if not SPACE_ID:
        missing.append("GENIE_SPACE_ID")
    if missing:
        raise GenieConfigError(
            "Databricks Genie is not configured: missing "
            + ", ".join(missing)
            + " in backend/.env (see .env.example)."
        )


async def _request(method: str, path: str, body: Optional[dict] = None) -> Dict[str, Any]:
    url = f"{HOST}{path}"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.request(
                method, url, headers=_headers(), json=body if body else None
            )
    except httpx.HTTPError as e:
        raise GenieError(f"Databricks Genie connection error: {e}") from e
    if resp.status_code >= 400:
        raise GenieError(
            f"Databricks Genie API {resp.status_code}: {resp.text[:500]}"
        )
    return resp.json()


def _extract_conversation_id(start_response: Dict[str, Any]) -> str:
    conv = start_response.get("conversation") or {}
    cid = (
        start_response.get("conversation_id")
        or conv.get("conversation_id")
        or conv.get("id")
    )
    if not cid:
        raise GenieError("Genie start-conversation returned no conversation_id.")
    return str(cid)


def _extract_message_id(start_response: Dict[str, Any]) -> str:
    msg = start_response.get("message") or {}
    mid = start_response.get("message_id") or msg.get("message_id") or msg.get("id")
    if not mid:
        raise GenieError("Genie start-conversation returned no message_id.")
    return str(mid)


async def _start_conversation(question: str) -> tuple[str, str]:
    resp = await _request(
        "POST",
        f"/api/2.0/genie/spaces/{SPACE_ID}/start-conversation",
        {"content": question},
    )
    return _extract_conversation_id(resp), _extract_message_id(resp)


async def _create_message(conversation_id: str, question: str) -> str:
    resp = await _request(
        "POST",
        f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{conversation_id}/messages",
        {"content": question},
    )
    mid = _extract_message_id({"message": resp})
    return mid


async def _get_message(conversation_id: str, message_id: str) -> Dict[str, Any]:
    return await _request(
        "GET",
        f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/"
        f"{conversation_id}/messages/{message_id}",
    )


def _text_answers(attachments: List[Dict[str, Any]]) -> List[str]:
    texts = [
        att.get("text", {}).get("content", "")
        for att in attachments
        if att.get("text", {}).get("content")
    ]
    if not texts:
        return []
    answers = [
        t for att, t in zip(attachments, texts)
        if att.get("text", {}).get("purpose") == _ANSWER_PURPOSE
    ]
    return answers or texts


def _query_attachments(attachments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for att in attachments:
        q = att.get("query")
        if q:
            out.append(
                {
                    "attachment_id": att.get("attachment_id"),
                    "query": q.get("query", ""),
                    "statement_id": q.get("statement_id"),
                    "row_count": q.get("query_result_metadata", {}).get("row_count"),
                }
            )
    return out


def _suggested_questions(attachments: List[Dict[str, Any]]) -> List[str]:
    questions: List[str] = []
    for att in attachments:
        sq = att.get("suggested_questions", {}).get("questions") or []
        questions.extend(sq)
    return questions


async def _fetch_query_data(
    conversation_id: str, message_id: str, query_att: Dict[str, Any]
) -> Dict[str, Any]:
    """Fetch the first query result chunk and map it to {column: value} rows."""
    att_id = query_att.get("attachment_id")
    if not att_id:
        return {"columns": [], "data": [], "truncated": False}

    resp = await _request(
        "GET",
        f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{conversation_id}/"
        f"messages/{message_id}/attachments/{att_id}/query-result",
    )
    sr = resp.get("statement_response", {})
    manifest = sr.get("manifest", {}) or {}
    schema = manifest.get("schema", {}) or {}
    columns = [c.get("name", f"col_{i}") for i, c in enumerate(schema.get("columns", []))]
    result = sr.get("result", {}) or {}
    data_array = result.get("data_array") or []
    row_count = manifest.get("total_row_count") or len(data_array)

    rows: List[dict] = []
    for values in data_array:
        obj: dict = {}
        for i, col in enumerate(columns):
            obj[col] = values[i] if i < len(values) else None
        rows.append(obj)

    truncated = bool(manifest.get("truncated")) or len(rows) < int(row_count or 0)
    if query_att.get("row_count") is not None:
        truncated = truncated or query_att.get("row_count") != len(rows)

    return {
        "columns": columns,
        "data": rows[: QUERY_RESULT_ROW_CAP],
        "truncated": truncated or len(rows) > QUERY_RESULT_ROW_CAP or len(rows) < int(row_count or 0),
    }


async def ask(question: str, thread_id: str = "") -> Dict[str, Any]:
    """Ask the Genie space a natural-language question.

    Returns the AI answer plus the generated SQL and (when available) result
    rows. A cached conversation for `thread_id` is reused so follow-ups keep
    context; pass "" to always start fresh.
    """
    _require_configured()

    thread_id = (thread_id or "").strip()
    conversation_id = _conversation_cache.get(thread_id) if thread_id else None

    if conversation_id:
        message_id = await _create_message(conversation_id, question)
    else:
        conversation_id, message_id = await _start_conversation(question)

    if thread_id:
        _conversation_cache[thread_id] = conversation_id

    message: Dict[str, Any] = {}
    for _ in range(POLL_MAX_ATTEMPTS):
        await asyncio.sleep(POLL_INTERVAL_S)
        message = await _get_message(conversation_id, message_id)
        status = message.get("status", "")
        if status in _TERMINAL_STATUSES:
            break

    status = message.get("status", "")
    if status in ("FAILED", "QUERY_RESULT_EXPIRED", "CANCELLED"):
        error = message.get("error") or {}
        detail = error.get("error") or error.get("type") or status
        raise GenieError(f"Genie could not answer the question ({detail}).")
    if status != "COMPLETED":
        raise GenieError(f"Genie timed out while answering the question (status {status}).")

    attachments = message.get("attachments") or []
    answers = _text_answers(attachments)
    queries = _query_attachments(attachments)

    result: Dict[str, Any] = {
        "answer": "\n".join(answers).strip(),
        "sql": queries[0]["query"] if queries else None,
        "rowCount": queries[0].get("row_count") if queries else None,
        "columns": [],
        "data": [],
        "truncated": False,
        "suggestedQuestions": _suggested_questions(attachments),
        "genieConversationId": conversation_id,
    }

    if queries:
        data = await _fetch_query_data(conversation_id, message_id, queries[0])
        result["columns"] = data["columns"]
        result["data"] = data["data"]
        result["truncated"] = data["truncated"]

    return result