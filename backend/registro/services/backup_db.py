# apps/registro/services/backup_db.py
import gzip, hashlib, os, shlex, subprocess, sys, tempfile
from datetime import datetime
from django.conf import settings
from django.db import connections
from pathlib import Path

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def _ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)

def run_full_backup() -> dict:
    """
    Faz dump completo do banco atual.
    - Postgres: usa pg_dump
    - SQLite: usa cópia do arquivo e compacta
    Retorna dict com: engine, output_file, size_bytes, sha256.
    Levanta Exception em erro.
    """
    alias = "default"
    db = settings.DATABASES[alias]
    engine = db["ENGINE"].split(".")[-1]   # "postgresql" ou "sqlite3"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))
    _ensure_dir(out_dir)

    if engine == "postgresql":
        # Credenciais
        host = db.get("HOST") or "localhost"
        port = str(db.get("PORT") or "5432")
        name = db["NAME"]
        user = db.get("USER") or ""
        password = db.get("PASSWORD") or ""

        # Arquivo de saída
        raw_path = out_dir / f"db-{stamp}.sql"
        gz_path = Path(str(raw_path) + ".gz")

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        cmd = [
            "pg_dump",
            "-h", host,
            "-p", port,
            "-U", user,
            "--no-owner",
            "--no-privileges",
            name,
        ]
        # Executa pg_dump para arquivo temporário não compactado
        with open(raw_path, "wb") as f:
            proc = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")
            try:
                raw_path.unlink(missing_ok=True)
            finally:
                pass
            raise RuntimeError(f"pg_dump falhou: {stderr}")

        # Compacta
        with open(raw_path, "rb") as fin, gzip.open(gz_path, "wb") as fout:
            for chunk in iter(lambda: fin.read(1024 * 1024), b""):
                fout.write(chunk)
        raw_path.unlink(missing_ok=True)

        sha = _sha256(gz_path)
        return {
            "engine": "postgresql",
            "output_file": str(gz_path),
            "size_bytes": gz_path.stat().st_size,
            "sha256": sha,
        }

    elif engine == "sqlite3":
        # Caminho do .sqlite
        db_path = Path(db["NAME"]).resolve()
        if not db_path.exists():
            raise RuntimeError(f"Arquivo SQLite não encontrado: {db_path}")

        out_path = Path(str(out_dir / f"db-{stamp}.sqlite") + ".gz")

        # Copia e compacta (lock de leitura mínimo)
        with open(db_path, "rb") as fin, gzip.open(out_path, "wb") as fout:
            for chunk in iter(lambda: fin.read(1024 * 1024), b""):
                fout.write(chunk)

        sha = _sha256(out_path)
        return {
            "engine": "sqlite3",
            "output_file": str(out_path),
            "size_bytes": out_path.stat().st_size,
            "sha256": sha,
        }
    else:
        raise RuntimeError(f"Engine não suportado: {engine}")
