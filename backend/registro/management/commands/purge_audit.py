# registro/management/commands/purge_audit.py
from django.core.management.base import BaseCommand
from django.utils.timezone import now, timedelta
from registro.audit.audit import AuditLog

class Command(BaseCommand):
    help = "Remove logs de auditoria antigos (padrão: 90 dias)"
    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=90)
    def handle(self, *args, **opts):
        cutoff = now() - timedelta(days=opts["days"])
        deleted, _ = AuditLog.objects.filter(timestamp__lt=cutoff).delete()
        self.stdout.write(f"Removidos {deleted} registros anteriores a {cutoff}.")
