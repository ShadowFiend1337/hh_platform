"""Fetch the pinned, MIT-licensed open-weight encoder without remote Python code."""
from pathlib import Path
from huggingface_hub import snapshot_download

BASE_MODEL = "cointegrated/rubert-tiny2"
BASE_REVISION = "e8ed3b0c8bbf4fb6984c3de043bf7d2f4e5969ae"
ROOT = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT / "server/data/models/rubert-tiny2"

def download():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=BASE_MODEL, revision=BASE_REVISION, local_dir=BASE_DIR,
        allow_patterns=["config.json", "model.safetensors", "tokenizer.json",
                        "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "README.md"],
    )
    return BASE_DIR

if __name__ == "__main__":
    print(download(), flush=True)
