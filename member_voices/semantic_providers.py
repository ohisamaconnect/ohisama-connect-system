#!/usr/bin/env python3
"""Optional production provider adapters for MEMBER VOICES.

Dependencies are intentionally optional:
- Gemini primary: google-genai
- OpenAI challenger: openai

This module performs provider calls only. It never materializes machine keys,
allocates Voice_ID, or writes Notion.
"""

from __future__ import annotations

import copy
import json
from typing import Any, Mapping

from semantic_extractor import ExtractionRequest
from semantic_provider_contract import build_provider_input


def wire_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    """Return a conservative cross-provider Structured Output schema.

    Provider APIs support JSON Schema subsets that differ over time.
    Stronger constraints remain enforced by local Draft 2020-12 validation.
    """

    drop = {"$schema", "$id", "uniqueItems", "pattern"}

    def walk(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: walk(v) for k, v in value.items() if k not in drop}
        if isinstance(value, list):
            return [walk(v) for v in value]
        return value

    return walk(copy.deepcopy(dict(schema)))


def render_provider_input(
    request: ExtractionRequest,
    *,
    relation_context: Mapping[str, Mapping[str, str]] | None = None,
    comparison_context: list[Mapping[str, Any]] | None = None,
) -> str:
    envelope = build_provider_input(
        request,
        relation_context=relation_context,
        comparison_context=comparison_context,
    )
    return json.dumps(envelope, ensure_ascii=False, sort_keys=True)


class Gemini38FlashProvider:
    provider_name = "google-gemini"

    def __init__(
        self,
        *,
        prompt_text: str,
        provider_schema: Mapping[str, Any],
        extractor_version: str,
        model_id: str = "gemini-3.8-flash",
        thinking_level: str = "medium",
        client: Any | None = None,
    ) -> None:
        self.prompt_text = prompt_text
        self.provider_schema = dict(provider_schema)
        self.extractor_version = extractor_version
        self.model_id = model_id
        self.thinking_level = thinking_level
        self._client = client

    def extract(
        self,
        request: ExtractionRequest,
        *,
        relation_context: Mapping[str, Mapping[str, str]] | None = None,
        comparison_context: list[Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise RuntimeError(
                    "google-genai is required for Gemini production extraction"
                ) from exc
            self._client = genai.Client()

        interaction = self._client.interactions.create(
            model=self.model_id,
            system_instruction=self.prompt_text,
            input=render_provider_input(
                request,
                relation_context=relation_context,
                comparison_context=comparison_context,
            ),
            generation_config={
                "thinking_level": self.thinking_level,
                "thinking_summaries": "none",
            },
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": wire_schema(self.provider_schema),
            },
            store=False,
        )
        if getattr(interaction, "status", None) in {"failed", "cancelled", "incomplete"}:
            raise RuntimeError(
                f"Gemini interaction did not complete: {getattr(interaction, 'status', None)}"
            )
        output = getattr(interaction, "output_text", None)
        if not output:
            raise RuntimeError("Gemini interaction returned no output_text")
        return json.loads(output)


class OpenAI54MiniChallenger:
    provider_name = "openai"

    def __init__(
        self,
        *,
        prompt_text: str,
        provider_schema: Mapping[str, Any],
        extractor_version: str,
        model_id: str = "gpt-5.4-mini-2026-03-17",
        reasoning_effort: str = "medium",
        client: Any | None = None,
    ) -> None:
        self.prompt_text = prompt_text
        self.provider_schema = dict(provider_schema)
        self.extractor_version = extractor_version
        self.model_id = model_id
        self.reasoning_effort = reasoning_effort
        self._client = client

    def extract(
        self,
        request: ExtractionRequest,
        *,
        relation_context: Mapping[str, Mapping[str, str]] | None = None,
        comparison_context: list[Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise RuntimeError(
                    "openai is required for OpenAI challenger evaluation"
                ) from exc
            self._client = OpenAI()

        response = self._client.responses.create(
            model=self.model_id,
            reasoning={"effort": self.reasoning_effort},
            input=[
                {"role": "system", "content": self.prompt_text},
                {
                    "role": "user",
                    "content": render_provider_input(
                        request,
                        relation_context=relation_context,
                        comparison_context=comparison_context,
                    ),
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "member_voices_provider_payload",
                    "strict": True,
                    "schema": wire_schema(self.provider_schema),
                }
            },
            store=False,
        )
        if getattr(response, "status", None) == "incomplete":
            raise RuntimeError("OpenAI challenger response incomplete")
        output = getattr(response, "output_text", None)
        if not output:
            raise RuntimeError("OpenAI challenger returned no output_text")
        return json.loads(output)
