# apps/registro/api/backup_download.py
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse, FileResponse, Http404
from rest_framework import permissions, views, status
from rest_framework.response import Response
from registro.backup import BackupRecord

class CanDownloadBackup(permissions.BasePermission):
    """
    CORREÇÃO DE SEGURANÇA:
    Alterado para permitir apenas usuários da equipe (Staff/Admin).
    """
    def has_permission(self, request, view):
        # Apenas usuários logados E com permissão de staff podem baixar
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)

class BackupDownloadView(views.APIView):
    permission_classes = [CanDownloadBackup]

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

        # Caso Nginx esteja na frente
        accel_prefix = getattr(settings, "BACKUP_ACCEL_PREFIX", None)
        backup_dir = Path(getattr(settings, "BACKUP_DIR"))
        try:
            relpath = path.relative_to(backup_dir)
        except ValueError:
            return Response({"detail": "Caminho inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if accel_prefix and not settings.DEBUG:
            resp = HttpResponse(status=200)
            resp["Content-Type"] = "application/octet-stream"
            resp["Content-Disposition"] = f'attachment; filename="{download_name}"'
            resp["X-Accel-Redirect"] = f"{accel_prefix}/{relpath.as_posix()}"
            return resp

        # Ambiente de desenvolvimento
        return FileResponse(open(path, "rb"),
                            as_attachment=True,
                            filename=download_name,
                            content_type="application/octet-stream")