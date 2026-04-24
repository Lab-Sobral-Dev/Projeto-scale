# registro/management/commands/purge_audit.py
from django.core.management.base import BaseCommand, CommandError
from django.utils.timezone import now, timedelta
from registro.audit_models import AuditLog

MIN_DAYS = 365

class Command(BaseCommand):
    help = "Remove logs de auditoria antigos (mínimo obrigatório: 365 dias)"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=365)

    def handle(self, *args, **opts):
        days = opts["days"]
        if days < MIN_DAYS:
            raise CommandError(
                f"--days deve ser >= {MIN_DAYS}. Recebido: {days}. "
                "Reduzir o período de retenção abaixo de 1 ano não é permitido."
            )

        cutoff = now() - timedelta(days=days)
        count = AuditLog.objects.filter(timestamp__lt=cutoff).count()

        AuditLog.objects.create(
            action="delete",
            model="AuditLog",
            path="management/purge_audit",
            method="CMD",
            extra={"days": days, "cutoff": cutoff.isoformat(), "registros_a_deletar": count},
        )

        deleted, _ = AuditLog.objects.filter(timestamp__lt=cutoff).delete()
        self.stdout.write(
            self.style.SUCCESS(f"Removidos {deleted} registros anteriores a {cutoff.date()}.")
        )
