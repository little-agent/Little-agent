"""Input/Output Guardrails Pipeline for Little Agent.

Built-ins: strip_ansi, escape_html_output, truncate_tool_output, reject_prompt_injection
Sequential input/output guardrail runner.
"""
from __future__ import annotations

import asyncio
import html
import inspect
import re
from typing import Any, Callable

class GuardrailTripped(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# ── Built-in guardrails ─────────────────────────────────────────

def strip_ansi(text: str) -> str:
    """Remove ANSI/OSC escape sequences before terminal output."""
    return re.sub(r'\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '', text)

def escape_html_output(text: str) -> str:
    """HTML-escape content before WEB_HTML rendering."""
    return html.escape(text)

def truncate_tool_output(text: str, limit: int = 30_000) -> str:
    """Prevent oversized tool output from flooding context."""
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n\n[Output truncated: {len(text)} chars total]"

def reject_prompt_injection(text: str) -> str | None:
    """Block obvious prompt injection patterns in tool results."""
    patterns = [
        r"ignore (all )?previous instructions",
        r"system\s*prompt\s*:",
        r"you are now",
        r"new instructions",
    ]
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            raise GuardrailTripped(f"Prompt injection pattern detected: {p}")
    return None  # no modification


# ── Pipeline runner ──────────────────────────────────────────────

async def run_guardrails(
    value: str,
    guardrails: list[Callable],
) -> str:
    """Run guardrails sequentially.

    Each guardrail receives the current value.
    - Return str -> replace value with result
    - Return None -> pass through unchanged
    - Raise GuardrailTripped -> block, re-raise
    """
    for g in guardrails:
        if asyncio.iscoroutinefunction(g):
            result = await g(value)
        else:
            result = await asyncio.to_thread(g, value)
        if result is not None:
            value = result
    return value


def run_guardrails_sync(
    value: str,
    guardrails: list[Callable],
) -> str:
    """Run guardrails sequentially in a synchronous context.

    Each guardrail receives the current value.
    - Return str -> replace value with result
    - Return None -> pass through unchanged
    - Raise GuardrailTripped -> block, re-raise
    """
    for g in guardrails:
        # Since these are synchronous callable filters, execute them directly
        result = g(value)
        if result is not None:
            value = result
    return value



# ── Default pipeline configurations ─────────────────────────────

TOOL_OUTPUT_GUARDRAILS = [
    reject_prompt_injection,    # block injection in tool results
    truncate_tool_output,       # cap output size
]

TERMINAL_OUTPUT_GUARDRAILS = [
    strip_ansi,                 # remove escape sequences from LLM output
]

WEB_OUTPUT_GUARDRAILS = [
    escape_html_output,         # HTML-escape before web rendering
]
