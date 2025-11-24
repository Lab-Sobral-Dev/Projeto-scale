# apps/registro/api/backups.py
from rest_framework import serializers, permissions, status, views
from rest_framework.response import Response
from django.utils.timezone import now
from django.db import transaction

from registro.backup import BackupRecord
from registro.services.backup_db import run_full_backup
from registro.audit_models import AuditLog  # use o caminho do seu AuditLog


class BackupRecordSerializer(serializers.ModelSerializer):
    executed_by_name = serializers.SerializerMethodField()
    trigger_type = serializers.SerializerMethodField()

    class Meta:
        model = BackupRecord
        fields = [
            "id",
            "created_at",
            "executed_by",
            "executed_by_name",
            "ip",
            "user_agent",
            "engine",
            "output_file",
            "size_bytes",
            "sha256",
            "status",
            "error_message",
            "trigger_type",
        ]
        read_only_fields = fields

    def get_executed_by_name(self, obj):
        """
        Retorna o nome completo do usuário (ou username) que disparou o backup.
        Para backups automáticos (executed_by=None), retorna None.
        """
        if obj.executed_by:
            return obj.executed_by.get_full_name() or obj.executed_by.username
        return None

    def get_trigger_type(self, obj):
        """
        Classifica a origem do backup:
        - 'automatic' -> quando foi disparado pelo Celery (executed_by=None
                         ou user_agent contendo 'celery-auto-backup')
        - 'manual'    -> quando foi disparado por um usuário (Admin/frontend)
        """
        if obj.executed_by is None:
            return "automatic"
        if obj.user_agent and "celery-auto-backup" in obj.user_agent:
            return "automatic"
        return "manual"


class IsBackupAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        # Somente Admin pode acionar backup
        return bool(request.user and request.user.is_staff)


class BackupExecuteView(views.APIView):
    permission_classes = [IsBackupAdmin]

    def post(self, request):
        user = request.user if request.user.is_authenticated else None
        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT", "")

        with transaction.atomic():
            rec = BackupRecord.objects.create(
                executed_by=user,
                ip=ip,
                user_agent=ua,
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

                # Auditar (se quiser, adicione a ação "backup" no seu Enum)
                AuditLog.objects.create(
                    user=user,
                    ip=ip,
                    user_agent=ua,
                    path=request.path,
                    method="POST",
                    status_code=200,
                    action="create",  # ou "backup" se você incluir essa ação
                    model="BackupRecord",
                    object_pk=str(rec.pk),
                )
                return Response(BackupRecordSerializer(rec).data, status=status.HTTP_201_CREATED)

            except Exception as e:
                rec.status = "error"
                rec.error_message = str(e)
                rec.save()
                AuditLog.objects.create(
                    user=user,
                    ip=ip,
                    user_agent=ua,
                    path=request.path,
                    method="POST",
                    status_code=500,
                    action="error",
                    model="BackupRecord",
                    object_pk=str(rec.pk),
                )
                return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BackupListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Qualquer usuário autenticado pode listar; ajuste se quiser restringir
        qs = BackupRecord.objects.all().order_by("-created_at")[:100]
        return Response(BackupRecordSerializer(qs, many=True).data)
