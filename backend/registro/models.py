from decimal import Decimal
from datetime import timedelta
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.db.models import F, Sum
from django.utils import timezone

KG_TO_G = Decimal('1000')

# >>> Tolerância (fixa em +/- 5%)
TOLERANCIA_PERCENTUAL = Decimal('0.05')  # 5%

# =========================
# Catálogos básicos
# =========================

class Produto(models.Model):
    nome = models.CharField(max_length=100)
    codigo_interno = models.CharField(max_length=50, unique=True)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.nome


class MateriaPrima(models.Model):
    nome = models.CharField(max_length=100)
    codigo_interno = models.CharField(max_length=50, unique=True, db_index=True)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nome} ({self.codigo_interno})"


# =========================
# Estrutura (BOM / Receita)
# =========================

class UnidadeMedida(models.TextChoices):
    # Mantemos outras UMs por compatibilidade futura, mas a regra do projeto é usar g para MPs.
    G = "g", "g"
    KG = "kg", "kg"
    ML = "mL", "mL"
    L = "L", "L"
    UN = "un", "un"


class EstruturaProduto(models.Model):
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT, related_name="estruturas")
    descricao = models.CharField(max_length=200, blank=True, default="")
    ativo = models.BooleanField(default=True)

    class Meta:
        unique_together = [("produto", "descricao")]

    def __str__(self):
        return f"Estrutura {self.produto} ({'ativa' if self.ativo else 'inativa'})"


class ItemEstrutura(models.Model):
    """
    Itens da estrutura para UM LOTE.
    Regra do projeto: MPs em GRAMAS (g).
    """
    estrutura = models.ForeignKey(EstruturaProduto, on_delete=models.CASCADE, related_name="itens")
    materia_prima = models.ForeignKey(MateriaPrima, on_delete=models.PROTECT, related_name="itens_estrutura")
    quantidade_por_lote = models.DecimalField(max_digits=14, decimal_places=3)  # sempre em g
    unidade = models.CharField(
        max_length=10,
        choices=UnidadeMedida.choices,
        default=UnidadeMedida.G,  # força g
        help_text="Regra do projeto: utilizar 'g' para MPs."
    )

    class Meta:
        unique_together = [("estrutura", "materia_prima")]

    def __str__(self):
        return f"{self.materia_prima} - {self.quantidade_por_lote} g"


# =========================
# Balança
# =========================

class Balanca(models.Model):
    TIPO_ETHERNET = 'ethernet'
    TIPO_SERIAL = 'serial'
    TIPO_USB = 'usb'
    TIPO_CHOICES = (
        (TIPO_ETHERNET, 'Ethernet'),
        (TIPO_SERIAL, 'Serial'),
        (TIPO_USB, 'USB'),
    )

    nome = models.CharField(max_length=100, unique=True)
    identificador = models.CharField(max_length=50, unique=True)
    tipo_conexao = models.CharField(max_length=20, choices=TIPO_CHOICES, default=TIPO_ETHERNET)

    # Ethernet
    endereco_ip = models.GenericIPAddressField(null=True, blank=True)
    porta = models.PositiveIntegerField(null=True, blank=True)

    # Serial/USB
    porta_serial = models.CharField(max_length=50, blank=True, default='')

    localizacao = models.CharField(max_length=100, blank=True, default='')
    capacidade_maxima = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)  # kg
    divisao = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    protocolo = models.CharField(max_length=50, blank=True, default='')
    ultima_calibracao = models.DateField(null=True, blank=True)
    frequencia_calibracao_dias = models.PositiveIntegerField(default=365)
    calibracao_realizada = models.BooleanField(default=False)

    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Balança'
        verbose_name_plural = 'Balanças'

    def __str__(self):
        return f'{self.nome} ({self.identificador})'

    def esta_em_calibracao(self, data_referencia=None):
        if not self.ultima_calibracao:
            return False

        referencia = data_referencia or timezone.localdate()
        if not self.calibracao_realizada:
            return False

        validade_ate = self.ultima_calibracao + timedelta(days=self.frequencia_calibracao_dias)
        return referencia <= validade_ate


# =========================
# Ordem de Produção
# =========================

class StatusOP(models.TextChoices):
    ABERTA = "aberta", "Aberta"
    EM_ANDAMENTO = "em_andamento", "Em andamento"
    CONCLUIDA = "concluida", "Concluída"
    CANCELADA = "cancelada", "Cancelada"


class OrdemProducao(models.Model):
    numero = models.CharField(max_length=50, unique=True, db_index=True)
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT, related_name="ops")
    estrutura = models.ForeignKey(EstruturaProduto, on_delete=models.PROTECT, related_name="ops")
    lote = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, choices=StatusOP.choices, default=StatusOP.ABERTA)
    observacoes = models.TextField(blank=True, default="")
    criada_em = models.DateTimeField(auto_now_add=True)
    concluida_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-criada_em"]

    def __str__(self):
        return f"OP {self.numero} - {self.produto} (lote {self.lote})"

    @transaction.atomic
    def gerar_itens_a_partir_da_estrutura(self, forcar=False):
        if self.itemop_set.exists() and not forcar:
            raise ValidationError("Esta OP já possui itens. Use forcar=True para recriar.")

        self.itemop_set.all().delete()

        itens = []
        for item in self.estrutura.itens.select_related("materia_prima"):
            itens.append(ItemOP(
                op=self,
                materia_prima=item.materia_prima,
                quantidade_necessaria=item.quantidade_por_lote,  # já em g
                unidade=UnidadeMedida.G
            ))
        ItemOP.objects.bulk_create(itens)

        self.status = StatusOP.ABERTA if itens else StatusOP.CANCELADA
        self.save(update_fields=["status"])

    def saldo_por_mp(self):
        return self.itemop_set.values("materia_prima__id", "materia_prima__nome").annotate(
            necessaria=Sum("quantidade_necessaria"),
            pesada=Sum("quantidade_pesada"),
            restante=F("quantidade_necessaria") - F("quantidade_pesada")
        )

    def verificar_e_concluir(self):
        """
        Conclui a OP somente quando TODOS os itens estiverem pelo menos no mínimo permitido.
        (O máximo já é protegido no momento da pesagem.)
        """
        itens = list(self.itemop_set.select_related('materia_prima'))

        pendente = any(
            (item.quantidade_pesada or Decimal('0')) < item.quantidade_minima_permitida
            for item in itens
        )

        novo_status = StatusOP.EM_ANDAMENTO if pendente else StatusOP.CONCLUIDA
        campos = ["status"]
        self.status = novo_status

        if novo_status == StatusOP.CONCLUIDA and not self.concluida_em:
            self.concluida_em = timezone.now()
            campos.append("concluida_em")

        self.save(update_fields=campos)


class ItemOP(models.Model):
    """
    Regra do projeto: todas as quantidades aqui em g.
    """
    op = models.ForeignKey(OrdemProducao, on_delete=models.CASCADE)
    materia_prima = models.ForeignKey(MateriaPrima, on_delete=models.PROTECT)
    quantidade_necessaria = models.DecimalField(max_digits=14, decimal_places=3)  # g
    quantidade_pesada = models.DecimalField(max_digits=14, decimal_places=3, default=0)  # g
    unidade = models.CharField(
        max_length=10,
        choices=UnidadeMedida.choices,
        default=UnidadeMedida.G,
        help_text="Sempre g."
    )

    class Meta:
        unique_together = [("op", "materia_prima")]

    @property
    def quantidade_restante(self):
        return self.quantidade_necessaria - self.quantidade_pesada

    # Limite inferior permitido (g) com tolerância de 5%
    @property
    def quantidade_minima_permitida(self):
        return self.quantidade_necessaria * (Decimal('1') - TOLERANCIA_PERCENTUAL)

    # Limite superior permitido (g)
    @property
    def quantidade_maxima_permitida(self):
        return self.quantidade_necessaria * (Decimal('1') + TOLERANCIA_PERCENTUAL)

    def __str__(self):
        return f"OP {self.op.numero} - {self.materia_prima} ({self.quantidade_pesada}/{self.quantidade_necessaria} g)"


# =========================
# Pesagem
# =========================

class Pesagem(models.Model):
    """
    Pesagem vinculada à OP/ItemOP.
    • Entrada do operador no formulário: líquido (kg) + tara (kg)
    • Backend calcula bruto (kg) e converte líquido para g para armazenar/validar
    • Todo o controle de saldo/operação interna é feito em g
    • >>> Regra: permitir parciais (valida só o teto aqui) e fechar OP quando atingir o mínimo.
    """
    op = models.ForeignKey(
        OrdemProducao,
        on_delete=models.PROTECT,
        related_name="pesagens"
    )
    item_op = models.ForeignKey(
        ItemOP,
        on_delete=models.PROTECT,
        related_name="pesagens",
        null=True,
        blank=True
    )
    pesador = models.CharField(max_length=100)
    data_hora = models.DateTimeField(auto_now_add=True)

    # Entradas e cálculos de massa
    bruto = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        help_text="Calculado automaticamente no backend (kg): tara_kg + liquido_kg."
    )
    tara = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        help_text="Entrada do operador em kg."
    )
    liquido = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0.0,
        help_text="Armazenado em g (entrada do operador é em kg; o backend converte)."
    )

    # Metadados adicionais
    balanca = models.ForeignKey(
        Balanca,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pesagens'
    )
    codigo_interno = models.CharField(max_length=50, default='TEMP')

    # Lote da MP utilizada — OBRIGATÓRIO
    lote_mp = models.CharField(
        "lote_MP",
        max_length=60,
        blank=False,                 # obrigatório em forms/admin/DRF
        db_index=True,
        help_text="Identificador do lote da matéria-prima usado nesta pesagem (ex.: 24A0321)."
    )

    class Meta:
        ordering = ["-data_hora"]
        indexes = [
            models.Index(fields=["item_op", "lote_mp"]),
        ]

    def clean(self):
        # Coerência entre OP e ItemOP
        if self.item_op and self.op_id and self.item_op.op_id != self.op_id:
            raise ValidationError("item_op não pertence à OP informada.")

        # Entradas devem permitir cálculo positivo
        tara_kg = self.tara or 0
        liquido_kg_informado = self.liquido or 0  # front manda em kg (vamos converter no save)
        if tara_kg < 0 or liquido_kg_informado <= 0:
            raise ValidationError("Informe tara (kg) ≥ 0 e líquido (kg) > 0.")

        # Lote MP obrigatório
        if not self.lote_mp or not str(self.lote_mp).strip():
            raise ValidationError("Informe o lote da matéria-prima (lote_MP é obrigatório).")

    @transaction.atomic
    def save(self, *args, **kwargs):
        # Normaliza o lote
        if self.lote_mp is not None:
            self.lote_mp = str(self.lote_mp).strip()

        # Garante obrigatoriedade fora do clean()
        if not self.lote_mp:
            raise ValidationError("Informe o lote da matéria-prima (lote_MP é obrigatório).")

        # Lê entradas em kg (front manda em kg)
        tara_kg = self.tara or 0
        liquido_kg_informado = self.liquido or 0

        if tara_kg < 0 or liquido_kg_informado <= 0:
            raise ValidationError("Informe tara (kg) ≥ 0 e líquido (kg) > 0.")

        # Converte para g (regra interna) e calcula bruto (kg) no backend
        novo_liquido_g = Decimal(liquido_kg_informado) * KG_TO_G
        if novo_liquido_g <= 0:
            raise ValidationError("O líquido calculado deve ser positivo após a conversão para g.")
        self.bruto = tara_kg + liquido_kg_informado

        # Coerência OP x ItemOP
        if self.item_op and self.op_id and self.item_op.op_id != self.op_id:
            raise ValidationError("item_op não pertence à OP informada.")
        if not self.item_op_id:
            raise ValidationError("Selecione um item da OP para vincular a pesagem.")

        if self.balanca_id:
            balanca = self.balanca or Balanca.objects.get(pk=self.balanca_id)
            if not balanca.esta_em_calibracao():
                raise ValidationError(
                    f"A balança '{balanca.nome}' está fora da calibração e não pode ser usada para pesagem."
                )

        # Estado anterior (para edições)
        antigo_liquido_g = Decimal('0')
        antigo_item_id = None
        if self.pk:
            antigo = (
                Pesagem.objects
                .select_for_update()
                .only('id', 'item_op_id', 'liquido')
                .get(pk=self.pk)
            )
            antigo_liquido_g = Decimal(antigo.liquido or 0)
            antigo_item_id = antigo.item_op_id

        # Lock do novo item
        item_novo = ItemOP.objects.select_for_update().get(pk=self.item_op_id)

        # Total projetado para validar teto (+5%)
        if antigo_item_id and antigo_item_id == self.item_op_id:
            # Edição no MESMO item: base - antigo + novo
            total_projetado_g = (item_novo.quantidade_pesada or 0) - antigo_liquido_g + novo_liquido_g
            tentativa_g_para_msg = novo_liquido_g - antigo_liquido_g  # delta
        else:
            # Criação ou TROCA de item: validar no novo item com +novo
            total_projetado_g = (item_novo.quantidade_pesada or 0) + novo_liquido_g
            tentativa_g_para_msg = novo_liquido_g

        limite_superior_g = item_novo.quantidade_maxima_permitida
        if total_projetado_g > limite_superior_g:
            raise ValidationError(
                f"Ultrapassa o limite superior (+/- 5%) para {item_novo.materia_prima}. "
                f"Máximo: {limite_superior_g:.3f} g | "
                f"Já pesado: {item_novo.quantidade_pesada:.3f} g | "
                f"Tentativa: +{tentativa_g_para_msg:.3f} g (total {total_projetado_g:.3f} g)."
            )

        # Persiste a pesagem guardando **líquido em g**
        self.liquido = novo_liquido_g
        super().save(*args, **kwargs)

        # Atualiza acumulados com DELTA
        if antigo_item_id and antigo_item_id != self.item_op_id:
            # Troca de item: remove do antigo e soma no novo
            ItemOP.objects.filter(pk=antigo_item_id).update(
                quantidade_pesada=F("quantidade_pesada") - antigo_liquido_g
            )
            ItemOP.objects.filter(pk=item_novo.pk).update(
                quantidade_pesada=F("quantidade_pesada") + novo_liquido_g
            )
        else:
            # Mesmo item (ou criação): aplica delta
            delta = novo_liquido_g - antigo_liquido_g
            if delta != 0:
                ItemOP.objects.filter(pk=item_novo.pk).update(
                    quantidade_pesada=F("quantidade_pesada") + delta
                )

        # Atualiza status da OP
        self.op.refresh_from_db(fields=[])
        if self.op.status in [StatusOP.ABERTA, StatusOP.EM_ANDAMENTO]:
            self.op.verificar_e_concluir()

    def __str__(self):
        base = f"{self.item_op.materia_prima.nome} - OP {self.op.numero} (lote {self.op.lote})"
        return f"{base} | MP {self.lote_mp}" if self.lote_mp else base
