#!/usr/bin/env python3
import os
from pathlib import Path

def get_little_home() -> Path:
    """Resolve the Little home directory, respecting LITTLE_HOME environment variable."""
    env_home = os.getenv("LITTLE_HOME")
    if env_home:
        return Path(env_home).resolve()
    return Path.home() / ".little"

def main():
    print("=== Little Agent Initialization ===")
    print("Silakan jawab pertanyaan berikut untuk membangun identitas agen Anda.\n")
    
    name = input("Nama Agen: ").strip() or "Little"
    mission = input("Misi Utama: ").strip() or "Membantu pengguna dengan tugas pemrograman dan analisis."
    style = input("Gaya Komunikasi: ").strip() or "Profesional, ringkas, dan teknis."
    constraints = input("Batasan Mutlak: ").strip() or "Jangan pernah membocorkan kunci API atau kredensial."

    soul_content = f"""# SOUL.md - {name}

## Profile
- **Name**: {name}
- **Role**: AI Agent

## Primary Mission
{mission}

## Communication Style
{style}

## Absolute Constraints
{constraints}

## Guidelines
- Selalu patuhi batasan mutlak.
- Pertahankan gaya komunikasi yang ditentukan dalam semua interaksi.
- Tetap fokus pada misi utama agen.
"""

    little_home = get_little_home()
    try:
        little_home.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"Error saat membuat direktori {little_home}: {e}")
        return

    soul_path = little_home / "SOUL.md"

    try:
        with open(soul_path, "w", encoding="utf-8") as f:
            f.write(soul_content)
        print(f"\n✅ SOUL.md berhasil dibuat/diperbarui di: {soul_path}")
        print("Identitas agen Anda telah dikonfigurasi.")
    except Exception as e:
        print(f"Gagal menulis ke {soul_path}: {e}")

if __name__ == "__main__":
    main()
