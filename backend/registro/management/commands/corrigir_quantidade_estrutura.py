"""
Corrige uma quantidade cadastrada errada na estrutura de um produto e propaga
a correção para as OPs que ainda não foram concluídas.

POR QUE ESTE COMANDO EXISTE
    A tela da estrutura rotula o campo como "Qtd p/ lote (g)" e envia
    `unidade: 'g'` fixo, enquanto a pesagem é feita em kg. Digitar o valor em
    kg nesse campo deixa a fórmula 1000x menor: a VITAMINA B12 do
    INGLESA-QUINA SOBRAL 430 ML entrou como 0,01548 g quando o lote pede
    15,48 g.

    Corrigir só a estrutura não basta. `gerar_itens_a_partir_da_estrutura`
    copia o valor para `ItemOP` no momento em que a OP é criada, então as OPs
    já abertas seguiriam pedindo a quantidade errada ao operador.

    Regerar os itens da OP (`gerar-itens?forcar=1`) não é alternativa: ele faz
    `itemop_set.all().delete()`, que esbarra no PROTECT das pesagens já
    registradas e zeraria o `quantidade_pesada` dos demais itens.

SEGURANÇA
    • Simula por padrão. Só altera com --apply.
    • Só toca em registros cujo valor atual é exatamente o informado em --de:
      nada é adivinhado por ordem de grandeza.
    • Não altera OPs concluídas ou canceladas — são registro de produção.
    • Não encosta em `quantidade_pesada`: o que já foi para a balança fica.
    • Grava AuditLog de cada alteração quando a auditoria está habilitada.

USO
    python manage.py corrigir_quantidade_estrutura \
        --mp 227 --produto PROD-430 --de 0.01548 --para 15.48
    (confira o relatório e repita com --apply)
"""
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from registro.db_context import get_db
from registro.models import ItemEstrutura, ItemOP, MateriaPrima, StatusOP

CASAS = Decimal("0.000001")  # resolução de 1 µg, igual à dos campos no banco
STATUS_IMUTAVEIS = (StatusOP.CONCLUIDA, StatusOP.CANCELADA)


def _decimal(valor, rotulo):
    try:
        return Decimal(str(valor).replace(",", ".")).quantize(CASAS)
    except (InvalidOperation, ValueError):
        raise CommandError(f"{rotulo} não é um número decimal válido: {valor!r}")


class Command(BaseCommand):
    help = (
        "Corrige a quantidade de uma matéria-prima na estrutura e propaga para as "
        "OPs não concluídas. Simula por padrão; use --apply para gravar."
    )

    def add_arguments(self, parser):
        parser.add_argument("--mp", required=True,
                            help="Código interno da matéria-prima (ex.: 227)")
        parser.add_argument("--de", required=True,
                            help="Valor atual, em g. Só registros com este valor exato são alterados")
        parser.add_argument("--para", required=True,
                            help="Valor correto, em g")
        parser.add_argument("--produto", default=None,
                            help="Código interno do produto, para restringir a uma estrutura")
        parser.add_argument("--apply", action="store_true",
                            help="Grava as alterações (sem esta flag, apenas simula)")

    def handle(self, *args, **opts):
        de = _decimal(opts["de"], "--de")
        para = _decimal(opts["para"], "--para")
        aplicar = opts["apply"]

        if de == para:
            raise CommandError("--de e --para são iguais: não há o que corrigir.")
        if para <= 0:
            raise CommandError("--para deve ser maior que zero.")

        try:
            mp = MateriaPrima.objects.get(codigo_interno=opts["mp"])
        except MateriaPrima.DoesNotExist:
            raise CommandError(f"Matéria-prima com código interno {opts['mp']!r} não existe.")

        itens_estrutura = ItemEstrutura.objects.filter(
            materia_prima=mp, quantidade_por_lote=de
        ).select_related("estrutura__produto")
        if opts["produto"]:
            itens_estrutura = itens_estrutura.filter(
                estrutura__produto__codigo_interno=opts["produto"]
            )

        estrutura_ids = list(itens_estrutura.values_list("estrutura_id", flat=True))

        itens_op = ItemOP.objects.filter(
            materia_prima=mp, quantidade_necessaria=de, op__estrutura_id__in=estrutura_ids
        ).exclude(op__status__in=STATUS_IMUTAVEIS).select_related("op")

        self.stdout.write(f"Matéria-prima: {mp.codigo_interno} — {mp.nome}")
        self.stdout.write(f"Correção: {de} g  ->  {para} g")
        self.stdout.write("")

        itens_estrutura = list(itens_estrutura)
        itens_op = list(itens_op)

        for item in itens_estrutura:
            self.stdout.write(f"  estrutura #{item.estrutura_id} ({item.estrutura.produto.nome})")
        for item in itens_op:
            self.stdout.write(
                f"  OP {item.op.numero} / lote {item.op.lote} [{item.op.status}] "
                f"— já pesado: {item.quantidade_pesada} g (preservado)"
            )

        total = len(itens_estrutura) + len(itens_op)
        if total == 0:
            self.stdout.write(self.style.WARNING(
                "Nenhum registro encontrado com o valor informado em --de. Nada a fazer."
            ))
            return

        if not aplicar:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING(
                f"SIMULAÇÃO — {len(itens_estrutura)} item(ns) de estrutura e "
                f"{len(itens_op)} item(ns) de OP seriam corrigidos. "
                "Repita com --apply para gravar."
            ))
            return

        with transaction.atomic(using=get_db()):
            for item in itens_estrutura:
                ItemEstrutura.objects.filter(pk=item.pk).update(quantidade_por_lote=para)
                self._auditar("ItemEstrutura", item.pk, "quantidade_por_lote", de, para)

            for item in itens_op:
                ItemOP.objects.filter(pk=item.pk).update(quantidade_necessaria=para)
                self._auditar("ItemOP", item.pk, "quantidade_necessaria", de, para)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Corrigidos: {len(itens_estrutura)} item(ns) de estrutura, "
            f"{len(itens_op)} item(ns) de OP."
        ))

    def _auditar(self, modelo, pk, campo, de, para):
        if not getattr(settings, "AUDIT_ENABLED", False):
            return
        from registro.audit_models import AuditLog

        AuditLog.objects.create(
            path="manage.py corrigir_quantidade_estrutura",
            method="CLI",
            action="update",
            model=modelo,
            object_pk=str(pk),
            criticidade=AuditLog.ALTA,
            changes={campo: {"de": str(de), "para": str(para)}},
            extra={"motivo": "correcao de unidade: valor em kg cadastrado em campo de g"},
        )
