from celery import shared_task
from django.utils.timezone import now

from registro.services.backup_db import run_full_backup
from registro.backup import BackupRecord
from registro.audit_models import AuditLog


@shared_task
def auto_backup():
    """
    Task usada pelos agendamentos (django-celery-beat).
    Não tem usuário logado, então o executed_by fica None.
    """
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

        # Log genérico de auditoria
        try:
            AuditLog.objects.create(
                user=None,
                ip="0.0.0.0",
                user_agent="celery-auto-backup",
                path="/auto-backup",
                method="CELERY",
                status_code=200,
                action="create",  # ou "backup" se você tiver essa ação
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
