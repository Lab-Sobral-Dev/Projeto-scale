# apps/registro/api/backups.py
from rest_framework import serializers, permissions, status, views
from rest_framework.response import Response
from django.utils.timezone import now
from django.db import transaction
from backup import BackupRecord
from services.backup_db import run_full_backup
from audit_models import AuditLog  # use o caminho do seu AuditLog

class BackupRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupRecord
        fields = ["id","created_at","executed_by","ip","user_agent","engine","output_file","size_bytes","sha256","status","error_message"]
        read_only_fields = fields

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
                executed_by=user, ip=ip, user_agent=ua,
                engine="", output_file="", size_bytes=0, sha256="", status="success"
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
                    user=user, ip=ip, user_agent=ua,
                    path=request.path, method="POST", status_code=200,
                    action="create",  # ou "backup" se você incluir essa ação
                    model="BackupRecord", object_pk=str(rec.pk)
                )
                return Response(BackupRecordSerializer(rec).data, status=status.HTTP_201_CREATED)

            except Exception as e:
                rec.status = "error"
                rec.error_message = str(e)
                rec.save()
                AuditLog.objects.create(
                    user=user, ip=ip, user_agent=ua,
                    path=request.path, method="POST", status_code=500,
                    action="error",
                    model="BackupRecord", object_pk=str(rec.pk)
                )
                return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BackupListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Qualquer usuário autenticado pode listar; ajuste se quiser restringir
        qs = BackupRecord.objects.all().order_by("-created_at")[:100]
        return Response(BackupRecordSerializer(qs, many=True).data)
