# apps/registro/services/backup_db.py
import gzip, hashlib, os, shlex, subprocess, sys, tempfile, shutil, csv
from datetime import datetime
from django.conf import settings
from pathlib import Path

def _sha256(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def _ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)

def _find_pg_dump() -> str:
    # 1) variável de ambiente explícita
    env_path = os.environ.get("PG_DUMP_BIN")
    if env_path and Path(env_path).exists():
        return env_path
    # 2) no PATH do container/servidor
    which = shutil.which("pg_dump")
    if which:
        return which
    # 3) caminhos comuns (debian/ubuntu/alpine)
    for p in ("/usr/bin/pg_dump", "/usr/local/bin/pg_dump", "/bin/pg_dump"):
        if Path(p).exists():
            return p
    raise RuntimeError(
        "pg_dump não encontrado. Instale o cliente do PostgreSQL no container/servidor "
        "(ex.: postgresql-client) ou defina PG_DUMP_BIN com o caminho completo."
    )

def run_full_backup(alias: str = "default") -> dict:
    db = settings.DATABASES[alias]
    engine = db["ENGINE"].split(".")[-1]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))
    _ensure_dir(out_dir)

    prefix = "db" if alias == "default" else f"db-{alias}"

    if engine == "postgresql":
        pg_dump = _find_pg_dump()

        host = db.get("HOST") or "localhost"
        port = str(db.get("PORT") or "5432")
        name = db["NAME"]
        user = db.get("USER") or ""
        password = db.get("PASSWORD") or ""

        raw_path = out_dir / f"{prefix}-{stamp}.sql"
        gz_path = Path(str(raw_path) + ".gz")

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        cmd = [
            pg_dump,
            "-h", host,
            "-p", port,
            "-U", user,
            "--no-owner",
            "--no-privileges",
            name,
        ]

        with open(raw_path, "wb") as f:
            proc = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env)
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")
            try:
                raw_path.unlink(missing_ok=True)
            finally:
                pass
            raise RuntimeError(f"pg_dump falhou: {stderr}")

        with open(raw_path, "rb") as fin, gzip.open(gz_path, "wb") as fout:
            for chunk in iter(lambda: fin.read(1024 * 1024), b""):
                fout.write(chunk)
        raw_path.unlink(missing_ok=True)

        sha = _sha256(gz_path)
        
        # Garante permissão de leitura para o Nginx (download)
        try:
            os.chmod(gz_path, 0o644)
        except Exception:
            pass

        return {
            "engine": "postgresql",
            "output_file": str(gz_path),
            "size_bytes": gz_path.stat().st_size,
            "sha256": sha,
        }

    elif engine == "sqlite3":
        db_path = Path(db["NAME"]).resolve()
        if not db_path.exists():
            raise RuntimeError(f"Arquivo SQLite não encontrado: {db_path}")

        out_path = Path(str(out_dir / f"{prefix}-{stamp}.sqlite") + ".gz")
        with open(db_path, "rb") as fin, gzip.open(out_path, "wb") as fout:
            for chunk in iter(lambda: fin.read(1024 * 1024), b""):
                fout.write(chunk)

        sha = _sha256(out_path)
        try:
            os.chmod(out_path, 0o644)
        except Exception:
            pass

        return {
            "engine": "sqlite3",
            "output_file": str(out_path),
            "size_bytes": out_path.stat().st_size,
            "sha256": sha,
        }
    else:
        raise RuntimeError(f"Engine não suportado: {engine}")

# =============================================================================
#  LÓGICA DE RESTORE COM REDE DE SEGURANÇA (SAFETY NET)
# =============================================================================

def _log_restore_event(msg: str):
    """
    Grava logs de restore em arquivo físico (persistente ao reset do banco).
    """
    try:
        backup_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))
        log_file = backup_dir / "restore_history.log"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {msg}\n")
    except Exception as e:
        print(f"Erro ao gravar log de restore: {e}")

def _export_audit_log_to_csv(backup_dir: Path):
    """
    Exporta a tabela de auditoria atual para CSV antes que ela seja apagada.
    """
    try:
        # Import tardio para evitar ciclo
        from registro.audit_models import AuditLog
        
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        csv_path = backup_dir / f"audit_log_snapshot_{timestamp}.csv"
        
        # Pega os últimos 5000 logs para garantir histórico recente
        logs = AuditLog.objects.all().order_by("-timestamp")[:5000]
        
        if not logs.exists():
            return None

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Data", "Usuario", "Ação", "Modelo", "ID Objeto", "Detalhes"])
            
            for log in logs:
                u_name = log.user.username if log.user else "Sistema/Anon"
                writer.writerow([
                    log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    u_name,
                    log.action,
                    log.model,
                    log.object_pk,
                    str(log.changes or log.extra or "")
                ])
        
        try:
            os.chmod(csv_path, 0o644)
        except:
            pass
            
        return str(csv_path)
    except Exception as e:
        print(f"Aviso: Falha ao exportar CSV de auditoria: {e}")
        return None

def _cleanup_safety_backups(backup_dir: Path, alias: str = "default", keep_last: int = 5) -> None:
    prefix = "db" if alias == "default" else f"db-{alias}"
    safety_files = sorted(
        backup_dir.glob(f"safety_before_restore_{prefix}-*.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in safety_files[keep_last:]:
        try:
            old.unlink()
            _log_restore_event(f"Safety backup antigo removido: {old.name}")
        except OSError as e:
            _log_restore_event(f"Aviso: não foi possível remover {old.name}: {e}")


def run_restore(backup_file_path: str, user_info: str = "Desconhecido", alias: str = "default") -> bool:
    """
    Restaura o banco com 3 camadas de segurança:
    1. Exporta Logs de Auditoria para CSV (Rastreabilidade do intervalo perdido)
    2. Cria Backup Full do estado atual (Recuperação em caso de erro/arrependimento)
    3. Loga o evento em arquivo de texto (Histórico persistente)
    """
    _log_restore_event(f"SOLICITAÇÃO DE RESTORE ({alias}) por {user_info}. Alvo: {backup_file_path}")
    backup_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))

    # 1. EXPORTA AUDITORIA
    csv_log = _export_audit_log_to_csv(backup_dir)
    if csv_log:
        _log_restore_event(f"Logs de auditoria exportados para: {csv_log}")

    # 2. SAFETY SNAPSHOT (Backup Preventivo)
    try:
        print("Criando backup de segurança...")
        safety_backup = run_full_backup(alias=alias)
        safety_path = Path(safety_backup["output_file"])
        new_name = safety_path.parent / f"safety_before_restore_{safety_path.name}"
        safety_path.rename(new_name)

        _log_restore_event(f"Backup de segurança criado: {new_name}")
    except Exception as e:
        msg = f"ABORTADO: Falha no backup de segurança: {e}"
        _log_restore_event(msg)
        raise RuntimeError("Restore cancelado para evitar perda de dados (falha no backup preventivo).")

    # Configurações do Banco para Restore
    db_conf = settings.DATABASES[alias]
    engine = db_conf["ENGINE"].split(".")[-1]
    
    path = Path(backup_file_path)
    if not path.exists():
        raise FileNotFoundError(f"Arquivo de backup não encontrado: {path}")

    if engine == "postgresql":
        pg_client = _find_pg_dump().replace("pg_dump", "psql")
        if not Path(pg_client).exists():
            pg_client = shutil.which("psql") or "/usr/bin/psql"

        host = db_conf.get("HOST") or "localhost"
        port = str(db_conf.get("PORT") or "5432")
        name = db_conf["NAME"]
        user = db_conf.get("USER") or ""
        password = db_conf.get("PASSWORD") or ""

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        # 3. KILL CONNECTIONS & DROP SCHEMA
        kill_sql = f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{name}' AND pid <> pg_backend_pid();"

        try:
            # Mata conexões
            subprocess.run(
                [pg_client, "-h", host, "-p", port, "-U", user, "-d", name, "-c", kill_sql],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env
            )

            # Limpa Schema Public (Reset do banco)
            reset_cmd = [
                pg_client, "-h", host, "-p", port, "-U", user, "-d", name,
                "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
            ]
            proc_reset = subprocess.run(reset_cmd, capture_output=True, env=env)
            if proc_reset.returncode != 0:
                raise RuntimeError(f"Falha ao limpar schema: {proc_reset.stderr.decode()}")

            # 4. RESTORE — descomprime via Python gzip (sem dependência do binário gzip)
            with tempfile.TemporaryFile() as tmp:
                with gzip.open(path, "rb") as f_in:
                    shutil.copyfileobj(f_in, tmp)
                tmp.seek(0)
                proc_restore = subprocess.run(
                    [pg_client, "-h", host, "-p", port, "-U", user, "-d", name],
                    stdin=tmp, env=env, stderr=subprocess.PIPE
                )
            if proc_restore.returncode != 0:
                raise RuntimeError(f"Erro no psql: {proc_restore.stderr.decode('utf-8')}")

            _log_restore_event(f"SUCESSO: Banco restaurado para versão {path.name}.")
            _cleanup_safety_backups(backup_dir, alias=alias)
            return True

        except Exception as e:
            _log_restore_event(f"ERRO CRÍTICO DURANTE O RESTORE: {e}")
            raise e

    elif engine == "sqlite3":
        db_path = Path(db_conf["NAME"]).resolve()
        shutil.copy(db_path, str(db_path) + ".safety_backup")
        try:
            with gzip.open(path, "rb") as f_in, open(db_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
            _log_restore_event("SUCESSO: SQLite restaurado.")
            _cleanup_safety_backups(backup_dir)
            return True
        except Exception as e:
            shutil.copy(str(db_path) + ".safety_backup", db_path)
            raise e
    else:
        raise RuntimeError("Engine não suportada.")