#!/usr/bin/env python3
"""Parse the echo-server log into a structured summary + per-block files.

Reads ``echo.log`` (newline-separated ``::REQ:: {...}`` chunks emitted by
``echo-server.mjs``) and produces:

- ``<out>/parsed.json``: one entry per HTTP request, with the fields most
  relevant to stealth-fidelity work (model, max_tokens, stream, tools count,
  messages count, system block summaries, metadata, thinking, context_management,
  and the full headers dict).
- ``<out>/system-blocks/block<N>.txt``: each system block from the first
  ``/v1/messages`` POST written to its own file, so diffing against the
  cloak's injected blocks or copying into a template asset is trivial.

Usage:
    parse-requests.py <echo.log> <out_dir>
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _split_chunks(log_text: str) -> list[str]:
    # The marker is emitted by echo-server.mjs at the start of each line.
    parts = log_text.split("::REQ::")
    return [p.strip() for p in parts[1:] if p.strip()]


def _summarize_system(system: object) -> object:
    if isinstance(system, list):
        out = []
        for block in system:
            text = block.get("text", "") if isinstance(block, dict) else ""
            out.append(
                {
                    "type": block.get("type") if isinstance(block, dict) else None,
                    "cache_control": block.get("cache_control") if isinstance(block, dict) else None,
                    "text_len": len(text),
                    "text_preview": text[:200],
                }
            )
        return out
    if isinstance(system, str):
        return {"type": "string", "text_len": len(system), "text_preview": system[:200]}
    return system


def main(log_path: str, out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "system-blocks").mkdir(exist_ok=True)

    log_text = Path(log_path).read_text()
    chunks = _split_chunks(log_text)

    summary = []
    first_messages_dumped = False

    for raw in chunks:
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            # Echo server may have emitted a startup line or a partial chunk.
            continue

        body = req.get("body") or {}
        entry = {
            "method": req.get("method"),
            "url": req.get("url"),
            "headers": req.get("headers"),
        }

        if isinstance(body, dict) and req.get("url", "").startswith("/v1/messages"):
            entry["model"] = body.get("model")
            entry["max_tokens"] = body.get("max_tokens")
            entry["stream"] = body.get("stream")
            entry["tools_count"] = len(body.get("tools") or [])
            entry["messages_count"] = len(body.get("messages") or [])
            entry["system"] = _summarize_system(body.get("system"))
            entry["metadata"] = body.get("metadata")
            entry["thinking"] = body.get("thinking")
            entry["context_management"] = body.get("context_management")
            entry["output_config"] = body.get("output_config")
            for k in ("temperature", "top_p", "top_k"):
                if k in body:
                    entry[k] = body[k]

            if not first_messages_dumped and isinstance(body.get("system"), list):
                for i, block in enumerate(body["system"]):
                    text = block.get("text", "") if isinstance(block, dict) else ""
                    (out / "system-blocks" / f"block{i}.txt").write_text(text)
                first_messages_dumped = True

        summary.append(entry)

    (out / "parsed.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    # Friendly stdout summary so the operator can sanity-check at a glance.
    print(f"requests: {len(summary)}")
    for i, e in enumerate(summary):
        msg = f"  [{i}] {e['method']} {e['url']}"
        if "model" in e:
            sys_info = e.get("system")
            if isinstance(sys_info, list):
                sizes = ",".join(str(b.get("text_len", "?")) for b in sys_info)
                msg += f"  model={e['model']} system_blocks=[{sizes}]"
            else:
                msg += f"  model={e['model']}"
        print(msg)
    print(f"parsed.json -> {out / 'parsed.json'}")
    if first_messages_dumped:
        print(f"system blocks -> {out / 'system-blocks'}/")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: parse-requests.py <echo.log> <out_dir>", file=os.sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
