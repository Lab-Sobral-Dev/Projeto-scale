# apps/registro/views_admin.py
from pathlib import Path

from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.http import Http404, HttpResponse, FileResponse

from registro.backup import BackupRecord


@staff_member_required
def admin_backup_download(request, pk: int):
    try:
        rec = BackupRecord.objects.get(pk=pk)
    except BackupRecord.DoesNotExist:
        raise Http404("Backup não encontrado.")

    if rec.status != "success":
        return HttpResponse("Backup indisponível (status diferente de sucesso).", status=409)

    path = Path(rec.output_file or "")
    if not path.exists():
        return HttpResponse("Arquivo não encontrado no servidor.", status=410)

    download_name = path.name

    accel_prefix = getattr(settings, "BACKUP_ACCEL_PREFIX", None)
    backup_dir = Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale")).resolve()

    try:
        relpath = path.resolve().relative_to(backup_dir)
    except ValueError:
        # Proteção: não serve arquivos fora do diretório de backup
        return HttpResponse("Caminho inválido.", status=400)

    # Em produção, entrega via Nginx + X-Accel-Redirect
    if accel_prefix and not settings.DEBUG:
        resp = HttpResponse(status=200)
        resp["Content-Type"] = "application/octet-stream"
        resp["Content-Disposition"] = f'attachment; filename="{download_name}"'
        resp["X-Accel-Redirect"] = f"{accel_prefix}/{relpath.as_posix()}"
        return resp

    # Em dev, entrega direto pelo Django
    return FileResponse(
        open(path, "rb"),
        as_attachment=True,
        filename=download_name,
        content_type="application/octet-stream",
    )
