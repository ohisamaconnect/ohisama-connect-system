#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a provider-neutral OC-OS Publication Draft prompt.

This script does not call an AI API. It creates one prompt text file from the
PUBLICATION_CONTEXT.json artifact plus the canonical prompt contract.

Default weekly draft targets are draft-only materials:
- ショーノート / note
- SNS投稿 / X
- トーク音声 / Spotify (title/description copy only; not audio approval)

No target implies permission to publish.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

VERSION = "0.1.0"
DEFAULT_TARGETS = [
    ("ショーノート", "note"),
    ("SNS投稿", "X"),
    ("トーク音声", "Spotify"),
]
ALLOWED_TYPES = {"トーク音声", "ショーノート", "SNS投稿", "オーディオグラム", "その他"}
ALLOWED_PLATFORMS = {"未定", "Spotify", "note", "X", "Instagram", "YouTube", "その他"}


def parse_target(value: str) -> tuple[str, str]:
    if "|" not in value:
        raise argparse.ArgumentTypeError("target must be Output_Type|Platform")
    output_type, platform = [x.strip() for x in value.split("|", 1)]
    if output_type not in ALLOWED_TYPES:
        raise argparse.ArgumentTypeError(f"unsupported Output_Type: {output_type}")
    if platform not in ALLOWED_PLATFORMS:
        raise argparse.ArgumentTypeError(f"unsupported Platform: {platform}")
    return output_type, platform


def main() -> int:
    parser = argparse.ArgumentParser(description="OC-OS Publication Draft Prompt Builder")
    parser.add_argument("context_json", type=Path)
    parser.add_argument(
        "--target",
        action="append",
        type=parse_target,
        help="Output_Type|Platform. Repeatable. If omitted, the standard weekly draft bundle is used.",
    )
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    context_path = args.context_json.expanduser().resolve()
    data = json.loads(context_path.read_text(encoding="utf-8-sig"))
    if data.get("schema_version") != "1.0":
        raise SystemExit("Unsupported PUBLICATION_CONTEXT schema_version")
    episode_key = str(data.get("episode_key") or "").strip()
    if not episode_key:
        raise SystemExit("episode_key missing")

    targets = args.target or DEFAULT_TARGETS
    target_rows = []
    for output_type, platform in targets:
        publication_key = f"{episode_key}|{output_type}|{platform}"
        target_rows.append({
            "output_type": output_type,
            "platform": platform,
            "publication_key": publication_key,
        })

    contract_path = Path(__file__).with_name("PUBLICATION_DRAFT_PROMPT_CONTRACT_v1.0.md")
    if not contract_path.exists():
        raise SystemExit(f"Prompt contract not found: {contract_path}")
    contract = contract_path.read_text(encoding="utf-8")

    target_json = json.dumps(target_rows, ensure_ascii=False, indent=2)
    context_json = json.dumps(data, ensure_ascii=False, indent=2)

    prompt = f"""OC-OS Publication Draft Generation Request
Builder-Version: {VERSION}

あなたは以下のCanonical Contractに従ってください。
最終成果物ではなく、人間確認前の下書きJSONだけを作成してください。
対象は TARGETS に列挙した公開物だけです。別の公開物を勝手に追加しないでください。
出力は publication_drafts.schema.json に適合するJSONのみとし、説明文やMarkdown fenceをJSONの外に付けないでください。

--- CANONICAL CONTRACT ---
{contract}

--- TARGETS ---
{target_json}

--- SOURCE CONTEXT ---
{context_json}

--- OUTPUT REQUIREMENTS ---
- schema_version = "1.0"
- episode_key = "{episode_key}"
- source_transcript_url はSOURCE CONTEXT.transcript.urlをそのまま使う
- generator_version は実際の生成モデル/Prompt版を識別できる文字列にする
- generated_at は生成時刻
- drafts はTARGETSと同数・同じpublication_keyだけを返す
- draft_key は publication_key + generator_version + source context を識別できる一意な文字列
- Publication_StatusやFinal_TextやPublic_URLは出力しない
- Transcript外の一人称感情を創作しない
- 要確認事項はreview_notesへ書く
"""

    output = args.output
    if output is None:
        output = context_path.with_name(f"{episode_key}_PUBLICATION_DRAFT_PROMPT.txt")
    output = output.expanduser().resolve()
    output.write_text(prompt, encoding="utf-8")

    print(f"version={VERSION}")
    print(f"episode_key={episode_key}")
    print(f"targets={len(target_rows)}")
    for row in target_rows:
        print(f"  - {row['publication_key']}")
    print(f"output={output}")
    print("AI API call: NONE")
    print("Publication action: NONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
