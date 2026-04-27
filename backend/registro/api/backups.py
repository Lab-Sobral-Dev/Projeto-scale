# apps/registro/api/backups.py
from rest_framework import serializers, permissions, status, views
from rest_framework.response import Response
from django.conf import settings as django_settings
from pathlib import Path

from registro.backup import BackupRecord
from registro.services.backup_db import run_full_backup, run_restore
from registro.audit_models import AuditLog
from usuarios.permissions import IsAdmin


class BackupRecordSerializer(serializers.ModelSerializer):
    executed_by_name = serializers.SerializerMethodField()
    trigger_type = serializers.SerializerMethodField()

    class Meta:
        model = BackupRecord
        fields = [
            "id", "created_at", "executed_by", "executed_by_name", "ip",
            "user_agent", "engine", "output_file", "size_bytes",
            "sha256", "status", "error_message", "trigger_type", "db_alias",
        ]
        read_only_fields = fields

    def get_executed_by_name(self, obj):
        if obj.executed_by:
            return obj.executed_by.get_full_name() or obj.executed_by.username
        return None

    def get_trigger_type(self, obj):
        if obj.executed_by is None:
            return "automatic"
        if obj.user_agent and "celery-auto-backup" in obj.user_agent:
            return "automatic"
        return "manual"


class BackupExecuteView(views.APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        user = request.user if request.user.is_authenticated else None
        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT", "")

        aliases = [a for a in ["default", "hml"] if a in django_settings.DATABASES]
        created = []

        for alias in aliases:
            rec = BackupRecord.objects.create(
                executed_by=user, ip=ip, user_agent=ua,
                engine="", output_file="", size_bytes=0, sha256="",
                status="running", db_alias=alias,
            )
            try:
                result = run_full_backup(alias=alias)
            except Exception as e:
                BackupRecord.objects.filter(pk=rec.pk).update(status="error", error_message=str(e))
                rec.refresh_from_db()
                created.append(BackupRecordSerializer(rec).data)
                continue

            BackupRecord.objects.filter(pk=rec.pk).update(
                engine=result["engine"],
                output_file=result["output_file"],
                size_bytes=result["size_bytes"],
                sha256=result["sha256"],
                status="success",
            )
            rec.refresh_from_db()
            AuditLog.objects.create(
                user=user, ip=ip, user_agent=ua, path=request.path,
                method="POST", status_code=200, action="create",
                model="BackupRecord", object_pk=str(rec.pk),
                changes={"alias": alias},
            )
            created.append(BackupRecordSerializer(rec).data)

        return Response(created, status=status.HTTP_201_CREATED)


class BackupListView(views.APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = BackupRecord.objects.all().order_by("-created_at")[:100]
        return Response(BackupRecordSerializer(qs, many=True).data)


# === NOVA VIEW DE RESTORE ===
class BackupRestoreView(views.APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk: int):
        try:
            rec = BackupRecord.objects.get(pk=pk)
        except BackupRecord.DoesNotExist:
            return Response({"detail": "Backup não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if not Path(rec.output_file).exists():
            return Response({"detail": "Arquivo físico não existe mais no servidor."}, status=status.HTTP_410_GONE)

        # Prepara info para o Log
        user = request.user
        ip = request.META.get("REMOTE_ADDR")
        user_info = f"{user.username} (ID: {user.pk}) - IP: {ip}"

        try:
            run_restore(rec.output_file, user_info=user_info, alias=rec.db_alias or "default")

            AuditLog.objects.create(
                user=user,
                ip=ip,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method="POST",
                status_code=200,
                action="restore",
                model="BackupRecord",
                object_pk=str(rec.pk),
                extra={
                    "arquivo": rec.output_file,
                    "resultado": "sucesso",
                    "obs": "Restore executado com backup preventivo.",
                },
            )

            return Response({
                "detail": "Sistema restaurado com sucesso! Um backup de segurança foi criado antes da operação."
            }, status=status.HTTP_200_OK)

        except Exception as e:
            AuditLog.objects.create(
                user=user,
                ip=ip,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                path=request.path,
                method="POST",
                status_code=500,
                action="restore",
                model="BackupRecord",
                object_pk=str(rec.pk),
                extra={
                    "arquivo": rec.output_file,
                    "resultado": "erro",
                    "obs": str(e),
                },
            )
            return Response({"detail": f"Falha crítica no restore: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)