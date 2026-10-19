#!/usr/bin/env python3
"""生成「山海经手札·听故事」朗读音频（edge-tts 微软神经语音，免费无 key）。

用法（在 blindgap-web/ 下）：
    python3 tools/gen_audio.py            # 生成全部声线（低沉解说 + 青年男声）
    python3 tools/gen_audio.py yunjian    # 只生成低沉解说

声线：
    yunjian  zh-CN-YunjianNeural  浑厚男声·体育解说风（默认主声线，纪录片感）
    yunxi    zh-CN-YunxiNeural    青年男声·明亮干净（备选声线）

产出：public/audio/{编号}-{声线}.mp3，并自动给 src/data/lore.ts 补 audio/audioAlt 字段。
依赖：pip install edge-tts（已装在隔离 venv）
"""
import asyncio
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB_AUDIO = os.path.join(ROOT, "public", "audio")
LORE_TS = os.path.join(ROOT, "src", "data", "lore.ts")
NARRATION_JSON = os.path.join(ROOT, ".tmp-narration.json")

VOICE_ALIAS = {
    "yunjian": "zh-CN-YunjianNeural",
    "yunxi": "zh-CN-YunxiNeural",
}
RATE = "-10%"  # 比默认慢一成，更接近纪录片解说的从容感


def voice_slug(voice_id: str) -> str:
    return voice_id.replace("zh-CN-", "").replace("Neural", "").lower()


async def gen_voice(voice_id: str, items: dict) -> None:
    import edge_tts

    slug = voice_slug(voice_id)
    for ip_id, item in items.items():
        out = os.path.join(PUB_AUDIO, f"{ip_id}-{slug}.mp3")
        communicate = edge_tts.Communicate(item["text"], voice_id, rate=RATE)
        await communicate.save(out)
        size = os.path.getsize(out) // 1024
        print(f"  ok {ip_id} {item['name']} -> {os.path.basename(out)} ({size} KB)")


def patch_lore(slugs: list) -> None:
    """给 lore.ts 每个条目补 audio（主声线）/ audioAlt（备选声线）字段。幂等。"""
    with open(LORE_TS, encoding="utf-8") as f:
        src = f.read()

    main_slug = slugs[0]
    alt_slug = slugs[1] if len(slugs) > 1 else None

    def repl(m: "re.Match") -> str:
        ip_id = m.group(2)
        lines = [f"    audio: 'audio/{ip_id}-{main_slug}.mp3',"]
        if alt_slug:
            lines.append(f"    audioAlt: 'audio/{ip_id}-{alt_slug}.mp3',")
        return m.group(1) + "\n".join(lines) + "\n"

    pattern = re.compile(r"(\n  '(\d{3})': \{\n)")
    if f"audio: 'audio/" in src:
        print("  lore.ts 已含 audio 字段，跳过 patch")
        return
    src = pattern.sub(repl, src)
    with open(LORE_TS, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"  lore.ts 已补 audio/audioAlt 字段（{main_slug}"
          + (f" / {alt_slug}" if alt_slug else "") + "）")


def main() -> None:
    os.makedirs(PUB_AUDIO, exist_ok=True)

    if not os.path.exists(NARRATION_JSON):
        print("== 先提取朗读文本 ==")
        subprocess.run(["node", "tools/extract_narration.mjs"], cwd=ROOT, check=True)
    with open(NARRATION_JSON, encoding="utf-8") as f:
        items = json.load(f)

    wanted = sys.argv[1:] or list(VOICE_ALIAS.keys())
    voice_ids = [VOICE_ALIAS.get(w, w) for w in wanted]

    for voice_id in voice_ids:
        print(f"== 生成声线 {voice_id} ==")
        asyncio.run(gen_voice(voice_id, items))

    slugs = [voice_slug(v) for v in voice_ids]
    patch_lore(slugs)

    total = sum(
        os.path.getsize(os.path.join(PUB_AUDIO, f))
        for f in os.listdir(PUB_AUDIO)
        if f.endswith(".mp3")
    )
    print(f"== 完成：public/audio 共 {total // 1024 // 1024} MB ==")
    os.remove(NARRATION_JSON)


if __name__ == "__main__":
    main()
