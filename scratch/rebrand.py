#!/usr/bin/env python3
import os
import re
from pathlib import Path

# Paths to skip
EXCLUDE_DIRS = {'.git', '.venv', '.pytest_cache', '__pycache__', 'node_modules', 'venv'}

# Replacements mapping (applied in this exact order to avoid nested collision issues)
REPLACEMENTS = [
    # Whole words / phrases first
    (re.compile(r'\blittle-agent\b'), 'little-agent'),
    (re.compile(r'\bLittle-Agent\b'), 'Little-Agent'),
    (re.compile(r'\bLITTLE-AGENT\b'), 'LITTLE-AGENT'),
    
    (re.compile(r'\blittle_agent\b'), 'little_agent'),
    (re.compile(r'\bLittle_Agent\b'), 'Little_Agent'),
    (re.compile(r'\bLITTLE_AGENT\b'), 'LITTLE_AGENT'),
    
    (re.compile(r'\blittle-gateway\b'), 'little-gateway'),
    (re.compile(r'\bLittle-Gateway\b'), 'Little-Gateway'),
    
    # Generic case replacements
    (re.compile(r'\blittle\b'), 'little'),
    (re.compile(r'\bLittle\b'), 'Little'),
    (re.compile(r'\bLITTLE\b'), 'LITTLE'),
    
    # Non-word-boundary replacements for imports/filenames/etc.
    (re.compile(r'little_bootstrap'), 'little_bootstrap'),
    (re.compile(r'little_cli'), 'little_cli'),
    (re.compile(r'little_constants'), 'little_constants'),
    (re.compile(r'little_logging'), 'little_logging'),
    (re.compile(r'little_state'), 'little_state'),
    (re.compile(r'little_time'), 'little_time'),
    (re.compile(r'little_tools'), 'little_tools'),
]

def replace_in_content(content: str) -> str:
    for pattern, repl in REPLACEMENTS:
        content = pattern.sub(repl, content)
    return content

def process_file_contents(root_dir: Path):
    print("Processing file contents...")
    for path in root_dir.glob('**/*'):
        # Check exclusions
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if path.is_file():
            # Skip binary files if possible (e.g. pdf, images, png, zip, tar, db)
            if path.suffix.lower() in {'.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.tar', '.gz', '.db', '.pyc', '.ico', '.woff', '.woff2', '.ttf', '.eot'}:
                continue
            try:
                content = path.read_text(encoding='utf-8')
                new_content = replace_in_content(content)
                if new_content != content:
                    path.write_text(new_content, encoding='utf-8')
                    print(f"Updated content in: {path.relative_to(root_dir)}")
            except UnicodeDecodeError:
                # Not a text file, skip
                continue
            except Exception as e:
                print(f"Error processing content of {path}: {e}")

def rename_files_and_directories(root_dir: Path):
    print("Renaming files and directories...")
    # Walk bottom-up so children are renamed before parents
    for dirpath, dirnames, filenames in os.walk(str(root_dir), topdown=False):
        # Filter excluded directories
        parts = Path(dirpath).parts
        if any(part in EXCLUDE_DIRS for part in parts):
            continue
            
        # 1. Rename files first
        for fname in filenames:
            if 'little' in fname.lower():
                old_path = Path(dirpath) / fname
                new_name = fname.replace('little', 'little').replace('Little', 'Little').replace('LITTLE', 'LITTLE')
                new_path = Path(dirpath) / new_name
                try:
                    old_path.rename(new_path)
                    print(f"Renamed file: {old_path.relative_to(root_dir)} -> {new_path.relative_to(root_dir)}")
                except Exception as e:
                    print(f"Failed to rename file {old_path}: {e}")
                    
        # 2. Rename directories
        for dname in dirnames:
            if 'little' in dname.lower():
                old_path = Path(dirpath) / dname
                new_name = dname.replace('little', 'little').replace('Little', 'Little').replace('LITTLE', 'LITTLE')
                new_path = Path(dirpath) / new_name
                try:
                    old_path.rename(new_path)
                    print(f"Renamed directory: {old_path.relative_to(root_dir)} -> {new_path.relative_to(root_dir)}")
                except Exception as e:
                    print(f"Failed to rename directory {old_path}: {e}")

if __name__ == '__main__':
    root_path = Path('/root/agent/little-agent')
    process_file_contents(root_path)
    rename_files_and_directories(root_path)
    print("Rebranding completed successfully!")
