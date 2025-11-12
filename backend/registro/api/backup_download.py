# apps/registro/api/backup_download.py
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse, FileResponse, Http404
from rest_framework import permissions, views, status
from rest_framework.response import Response
from registro.backup import BackupRecord

class CanDownloadBackup(permissions.BasePermission):
    """
    Regra simples: qualquer usuário autenticado pode baixar.
    Troque por is_staff se preferir restringir.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

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

        # Nome de download amigável
        download_name = path.name

        # Caso Nginx esteja na frente, use X-Accel-Redirect para entrega eficiente
        accel_prefix = getattr(settings, "BACKUP_ACCEL_PREFIX", None)
        backup_dir = Path(getattr(settings, "BACKUP_DIR"))
        try:
            relpath = path.relative_to(backup_dir)  # segurança: deve estar sob BACKUP_DIR
        except ValueError:
            # Não permitir arquivos fora do diretório de backups
            return Response({"detail": "Caminho inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if accel_prefix and not settings.DEBUG:
            # Resposta vazia, Nginx entrega o arquivo real
            resp = HttpResponse(status=200)
            resp["Content-Type"] = "application/octet-stream"
            resp["Content-Disposition"] = f'attachment; filename="{download_name}"'
            resp["X-Accel-Redirect"] = f"{accel_prefix}/{relpath.as_posix()}"
            return resp

        # Ambiente de desenvolvimento (sem Nginx/Accel)
        return FileResponse(open(path, "rb"),
                            as_attachment=True,
                            filename=download_name,
                            content_type="application/octet-stream")
