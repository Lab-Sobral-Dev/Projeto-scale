# apps/registro/api/backup_download.py
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse, FileResponse, Http404
from rest_framework import views, status
from rest_framework.response import Response
from registro.backup import BackupRecord
from registro.audit_models import AuditLog
from registro.utils.audit import client_ip
from usuarios.permissions import IsAdmin


class BackupDownloadView(views.APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk: int):
        try:
            rec = BackupRecord.objects.get(pk=pk)
        except BackupRecord.DoesNotExist:
            raise Http404("Backup não encontrado.")

        if rec.status != "success":
            return Response({"detail": "Backup indisponível (status diferente de sucesso)."},
                            status=status.HTTP_409_CONFLICT)

        path = Path(rec.output_file)
        if not path.exists():
            return Response({"detail": "Arquivo não encontrado no servidor."},
                            status=status.HTTP_410_GONE)

        download_name = path.name

        accel_prefix = getattr(settings, "BACKUP_ACCEL_PREFIX", None)
        backup_dir = Path(getattr(settings, "BACKUP_DIR"))
        try:
            relpath = path.relative_to(backup_dir)
        except ValueError:
            return Response({"detail": "Caminho inválido."}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.objects.create(
            user=request.user,
            ip=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            path=request.path,
            method="GET",
            status_code=200,
            action="download",
            model="BackupRecord",
            object_pk=str(rec.pk),
            extra={"arquivo": download_name, "tamanho": rec.size_bytes},
        )

        if accel_prefix and not settings.DEBUG:
            resp = HttpResponse(status=200)
            resp["Content-Type"] = "application/octet-stream"
            resp["Content-Disposition"] = f'attachment; filename="{download_name}"'
            resp["X-Accel-Redirect"] = f"{accel_prefix}/{relpath.as_posix()}"
            return resp

        return FileResponse(open(path, "rb"),
                            as_attachment=True,
                            filename=download_name,
                            content_type="application/octet-stream")