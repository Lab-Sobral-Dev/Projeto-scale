# apps/registro/tasks.py
import os
import time
from pathlib import Path
from celery import shared_task
from django.conf import settings
from django.utils.timezone import now

from registro.services.backup_db import run_full_backup
from registro.backup import BackupRecord
from registro.backup_config import BackupConfig  # Importar o modelo de configuração
from registro.audit_models import AuditLog
from registro.services.backup_notify import notify_backup_failure

def _clean_old_backups():
    """
    Remove arquivos de backup mais antigos que 'retention_days'.
    """
    try:
        config = BackupConfig.objects.first()
        # Se não houver configuração ou dias de retenção for 0/None, não faz nada
        if not config or not config.retention_days:
            return

        backup_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))
        if not backup_dir.exists():
            return

        days_in_seconds = config.retention_days * 86400
        now_time = time.time()

        count_deleted = 0
        
        # Itera sobre os arquivos no diretório
        for item in backup_dir.iterdir():
            # Segurança: só deleta arquivos que parecem backups (db-*.gz ou .sqlite.gz)
            if item.is_file() and item.name.startswith("db-") and item.name.endswith(".gz"):
                file_age = now_time - item.stat().st_mtime
                if file_age > days_in_seconds:
                    try:
                        item.unlink()  # Deleta o arquivo
                        count_deleted += 1
                    except Exception as e:
                        print(f"Erro ao deletar backup antigo {item.name}: {e}")
        
        if count_deleted > 0:
            print(f"Limpeza de backup: {count_deleted} arquivos removidos (Retenção: {config.retention_days} dias).")

    except Exception as e:
        print(f"Erro na rotina de limpeza de backups: {e}")

@shared_task
def auto_backup():
    """
    Task usada pelos agendamentos (django-celery-beat).
    """
    # 1. Tenta limpar backups antigos antes de criar um novo (libera espaço)
    _clean_old_backups()

    rec = BackupRecord.objects.create(
        executed_by=None,
        ip="0.0.0.0",
        user_agent="celery-auto-backup",
        engine="",
        output_file="", 
        size_bytes=0,
        sha256="",
        status="success",
    )

    try:
        result = run_full_backup()
        rec.engine = result["engine"]
        rec.output_file = result["output_file"]
        rec.size_bytes = result["size_bytes"]
        rec.sha256 = result["sha256"]
        rec.status = "success"
        rec.save()

        try:
            AuditLog.objects.create(
                user=None,
                ip="0.0.0.0",
                user_agent="celery-auto-backup",
                path="/auto-backup",
                method="CELERY",
                status_code=200,
                action="create",
                model="BackupRecord",
                object_pk=str(rec.pk),
                changes={
                    "engine": rec.engine,
                    "output_file": rec.output_file,
                    "size_bytes": rec.size_bytes,
                },
            )
        except Exception:
            pass

    except Exception as e:
        rec.status = "error"
        rec.error_message = str(e)
        rec.save()

        notify_backup_failure(
            error_message=str(e),
            rec=rec,
            context={"source": "celery_auto_backup"},
        )

        try:
            AuditLog.objects.create(
                user=None,
                ip="0.0.0.0",
                user_agent="celery-auto-backup",
                path="/auto-backup",
                method="CELERY",
                status_code=500,
                action="error",
                model="BackupRecord",
                object_pk=str(rec.pk),
                extra={"error": str(e)},
            )
        except Exception:
            pass