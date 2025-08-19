# registro/models.py
from django.db import models

class Produto(models.Model):
    nome = models.CharField(max_length=100)
    codigo_interno = models.CharField(max_length=50, unique=True)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.nome}"


class MateriaPrima(models.Model):
    nome = models.CharField(max_length=100)
    codigo_interno = models.CharField(max_length=50, unique=True, db_index=True)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        # opcional: mostrar o código junto
        return f"{self.nome} ({self.codigo_interno})"


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


class Pesagem(models.Model):
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT, related_name="pesagens")
    materia_prima = models.ForeignKey(MateriaPrima, on_delete=models.PROTECT, related_name="pesagens")
    op = models.CharField(max_length=50)
    pesador = models.CharField(max_length=100)
    lote = models.CharField(max_length=50)
    data_hora = models.DateTimeField(auto_now_add=True)

    bruto = models.DecimalField(max_digits=10, decimal_places=3)
    tara = models.DecimalField(max_digits=10, decimal_places=3)
    liquido = models.DecimalField(max_digits=10, decimal_places=3, default=0.0)

    volume = models.CharField(max_length=50)
    # 🔁 agora é FK (null/blank permitido; SET_NULL para não perder histórico)
    balanca = models.ForeignKey(Balanca, null=True, blank=True, on_delete=models.SET_NULL, related_name='pesagens')
    codigo_interno = models.CharField(max_length=50, default='TEMP')

    def save(self, *args, **kwargs):
        self.liquido = self.bruto - self.tara
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.materia_prima.nome} - OP {self.op} ({self.lote})"
