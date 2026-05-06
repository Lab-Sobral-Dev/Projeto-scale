from django.core.management.base import BaseCommand, CommandError
from django.utils.timezone import now, timedelta
from registro.audit_models import AuditLog

MIN_DIAS_BAIXA = 30
MIN_DIAS_ALTA = 365
BATCH = 5000


class Command(BaseCommand):
    help = (
        "Remove logs de auditoria por criticidade.\n"
        "  baixa  (request / token_refresh / error): padrão 90 dias, mínimo 30\n"
        "  alta   (create / update / delete / login): padrão 1825 dias, mínimo 365\n"
        "Use --dry-run para simular sem deletar."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dias-baixa", type=int, default=90,
                            help="Reter logs de baixa criticidade por N dias (padrão 90)")
        parser.add_argument("--dias-alta", type=int, default=1825,
                            help="Reter logs de alta criticidade por N dias (padrão 1825 = 5 anos)")
        parser.add_argument("--dry-run", action="store_true",
                            help="Apenas conta — não remove nada")

    def handle(self, *args, **opts):
        dias_baixa = opts["dias_baixa"]
        dias_alta = opts["dias_alta"]
        dry_run = opts["dry_run"]

        if dias_baixa < MIN_DIAS_BAIXA:
            raise CommandError(
                f"--dias-baixa mínimo é {MIN_DIAS_BAIXA}. Recebido: {dias_baixa}."
            )
        if dias_alta < MIN_DIAS_ALTA:
            raise CommandError(
                f"--dias-alta mínimo é {MIN_DIAS_ALTA}. Recebido: {dias_alta}."
            )

        cutoff_baixa = now() - timedelta(days=dias_baixa)
        cutoff_alta = now() - timedelta(days=dias_alta)

        qs_baixa = AuditLog.objects.filter(criticidade=AuditLog.BAIXA, timestamp__lt=cutoff_baixa)
        qs_alta = AuditLog.objects.filter(criticidade=AuditLog.ALTA, timestamp__lt=cutoff_alta)

        count_baixa = qs_baixa.count()
        count_alta = qs_alta.count()
        total = count_baixa + count_alta

        self.stdout.write(
            f"Logs a remover: {count_baixa} de baixa criticidade (> {dias_baixa} dias), "
            f"{count_alta} de alta criticidade (> {dias_alta} dias). Total: {total}."
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("--dry-run ativo. Nenhum registro removido."))
            return

        if total == 0:
            self.stdout.write("Nenhum registro para remover.")
            return

        AuditLog.objects.create(
            action="delete",
            model="AuditLog",
            path="management/purge_audit",
            method="CMD",
            extra={
                "dias_baixa": dias_baixa,
                "dias_alta": dias_alta,
                "cutoff_baixa": cutoff_baixa.isoformat(),
                "cutoff_alta": cutoff_alta.isoformat(),
                "registros_baixa": count_baixa,
                "registros_alta": count_alta,
            },
        )

        deleted_total = 0
        for qs in (qs_baixa, qs_alta):
            while True:
                ids = list(qs.values_list("pk", flat=True)[:BATCH])
                if not ids:
                    break
                deleted, _ = AuditLog.objects.filter(pk__in=ids).delete()
                deleted_total += deleted

        self.stdout.write(self.style.SUCCESS(f"Removidos {deleted_total} registros no total."))
