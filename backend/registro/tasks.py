# backend/registro/tasks.py
import os
import time
from pathlib import Path
from celery import shared_task
from django.conf import settings
from django.utils.timezone import now

from registro.services.backup_db import run_full_backup
from registro.backup import BackupRecord
# O import do Config deve ser feito dentro da função para evitar Ciclo de Importação
# se o backup_config.py também importar tasks.

from registro.audit_models import AuditLog
from registro.services.backup_notify import notify_backup_failure

def _clean_old_backups():
    """
    Remove arquivos de backup mais antigos que 'retention_days'.
    """
    try:
        from registro.backup_config import BackupConfig  # Import tardio para evitar ciclo
        config = BackupConfig.objects.first()
        
        retention_days = config.retention_days if (config and config.retention_days) else 30
        if not retention_days:
            return

        backup_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))
        if not backup_dir.exists():
            return

        days_in_seconds = retention_days * 86400
        now_time = time.time()
        count_deleted = 0
        
        for item in backup_dir.iterdir():
            if item.is_file() and item.name.startswith("db-") and item.name.endswith(".gz"):
                file_age = now_time - item.stat().st_mtime
                if file_age > days_in_seconds:
                    try:
                        item.unlink()
                        count_deleted += 1
                    except Exception as e:
                        print(f"Erro ao deletar backup antigo {item.name}: {e}")
        
        if count_deleted > 0:
            print(f"Limpeza: {count_deleted} backups antigos removidos.")

    except Exception as e:
        print(f"Erro na rotina de limpeza de backups: {e}")

@shared_task(
    name="registro.auto_backup",
    bind=True,
    acks_late=True,
    max_retries=3,
    default_retry_delay=300,
)
def auto_backup(self):
    """
    Task executada periodicamente pelo Celery Beat.
    Faz backup de todos os bancos configurados (default + hml).
    """
    from django.conf import settings as django_settings

    _clean_old_backups()

    aliases = [
        a for a in ["default", "hml"]
        if a in django_settings.DATABASES and django_settings.DATABASES[a].get("NAME")
    ]
    first_error = None

    for alias in aliases:
        rec = BackupRecord.objects.create(
            executed_by=None,
            ip="0.0.0.0",
            user_agent="celery-auto-backup",
            engine="", output_file="", size_bytes=0, sha256="",
            status="running",
            db_alias=alias,
        )

        try:
            result = run_full_backup(alias=alias)
        except Exception as e:
            BackupRecord.objects.filter(pk=rec.pk).update(status="error", error_message=str(e))
            notify_backup_failure(
                error_message=str(e),
                rec=rec,
                context={"source": "celery_auto_backup", "alias": alias},
            )
            if alias == "default":
                first_error = e
            continue

        BackupRecord.objects.filter(pk=rec.pk).update(
            engine=result["engine"],
            output_file=result["output_file"],
            size_bytes=result["size_bytes"],
            sha256=result["sha256"],
            status="success",
        )
        rec.refresh_from_db()

        try:
            AuditLog.objects.create(
                user=None,
                ip="127.0.0.1",
                user_agent="Celery Beat",
                path="auto_backup",
                method="TASK",
                status_code=200,
                action="create",
                model="BackupRecord",
                object_pk=str(rec.pk),
                changes={"file": rec.output_file, "alias": alias},
            )
        except Exception:
            pass

    if first_error:
        raise self.retry(exc=first_error)