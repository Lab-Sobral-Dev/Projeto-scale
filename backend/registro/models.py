# models.py

from decimal import Decimal
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.db.models import F, Sum, Q
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

    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Balança'
        verbose_name_plural = 'Balanças'

    def __str__(self):
        return f'{self.nome} ({self.identificador})'


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
        pendente = self.itemop_set.filter(
            Q(quantidade_pesada__lt=F("quantidade_necessaria"))
        ).exists()

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

    # Adicionado: Limite inferior permitido (g) com tolerância de 5%
    @property
    def quantidade_minima_permitida(self):
        return self.quantidade_necessaria * (Decimal('1') - TOLERANCIA_PERCENTUAL)

    # Tolerância: limite superior permitido (g)
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
    • >>> Respeita tolerância de +/- 5% sobre a quantidade necessária do ItemOP
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

    # Lote da MP utilizada
    lote_mp = models.CharField(
        "lote_MP",
        max_length=60,
        blank=True,
        default="",
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
        liquido_kg_informado = self.liquido or 0  # aqui o front manda em kg
        if tara_kg < 0 or liquido_kg_informado <= 0:
            raise ValidationError("Informe tara (kg) ≥ 0 e líquido (kg) > 0.")

    @transaction.atomic
    def save(self, *args, **kwargs):
        # Normaliza o lote
        if self.lote_mp:
            self.lote_mp = self.lote_mp.strip()

        # Lê entradas em kg
        tara_kg = self.tara or 0
        liquido_kg_informado = self.liquido or 0  # **frontend manda em kg**
        # Converte para g para regra interna
        liquido_g = liquido_kg_informado * KG_TO_G

        if liquido_g <= 0:
            raise ValidationError("O líquido calculado deve ser positivo após a conversão para g.")

        # Calcula o bruto (kg) no backend — não confiar no valor vindo do front
        self.bruto = tara_kg + liquido_kg_informado

        # Trava o item e checa SALDO com TOLERÂNCIA (em g)
        item = ItemOP.objects.select_for_update().get(pk=self.item_op_id)
        
        # Obtém os limites inferior e superior
        limite_superior_g = item.quantidade_maxima_permitida
        limite_inferior_g = item.quantidade_minima_permitida
        
        novo_total_g = (item.quantidade_pesada or 0) + liquido_g

        # Verifica se o novo total está fora da faixa de tolerância
        if not (limite_inferior_g <= novo_total_g <= limite_superior_g):
            raise ValidationError(
                f"Quantidade excede a faixa de tolerância de +/- 5% para {item.materia_prima}. "
                f"Faixa permitida: {limite_inferior_g:.3f} g a {limite_superior_g:.3f} g | "
                f"Já pesado: {item.quantidade_pesada:.3f} g | "
                f"Tentativa: +{liquido_g:.3f} g (total {novo_total_g:.3f} g)."
            )

        # Persiste a pesagem guardando **líquido em g**
        self.liquido = liquido_g
        super().save(*args, **kwargs)

        # Atualiza acumulado (g)
        ItemOP.objects.filter(pk=item.pk).update(
            quantidade_pesada=F("quantidade_pesada") + self.liquido
        )

        # Atualiza status da OP (continua igual: conclui quando pesada >= necessaria)
        self.op.refresh_from_db(fields=[])
        if self.op.status in [StatusOP.ABERTA, StatusOP.EM_ANDAMENTO]:
            self.op.verificar_e_concluir()

    def __str__(self):
        base = f"{self.item_op.materia_prima.nome} - OP {self.op.numero} (lote {self.op.lote})"
        return f"{base} | MP {self.lote_mp}" if self.lote_mp else base