from decimal import Decimal
from django.db import migrations

KG_TO_G = Decimal('1000')

def forwards(apps, schema_editor):
    UnidadeMedida = apps.get_model('registro', 'ItemEstrutura')._meta.get_field('unidade').choices
    ItemEstrutura = apps.get_model('registro', 'ItemEstrutura')
    ItemOP = apps.get_model('registro', 'ItemOP')
    Pesagem = apps.get_model('registro', 'Pesagem')

    # ItemEstrutura: kg -> g
    for ie in ItemEstrutura.objects.all().iterator():
        if ie.unidade == 'kg':
            ie.quantidade_por_lote = (ie.quantidade_por_lote or 0) * KG_TO_G
            ie.unidade = 'g'
            ie.save(update_fields=['quantidade_por_lote', 'unidade'])

    # ItemOP: kg -> g
    for io in ItemOP.objects.all().iterator():
        if io.unidade == 'kg':
            io.quantidade_necessaria = (io.quantidade_necessaria or 0) * KG_TO_G
            io.quantidade_pesada = (io.quantidade_pesada or 0) * KG_TO_G
            io.unidade = 'g'
            io.save(update_fields=['quantidade_necessaria', 'quantidade_pesada', 'unidade'])

    # Pesagem: liquido (antigo) kg -> g
    for p in Pesagem.objects.all().iterator():
        # Se você já tinha dados com liquido em kg, converta:
        p.liquido = (p.liquido or 0) * KG_TO_G
        p.save(update_fields=['liquido'])

def backwards(apps, schema_editor):
    # Reverte g -> kg (apenas se desejar)
    ItemEstrutura = apps.get_model('registro', 'ItemEstrutura')
    ItemOP = apps.get_model('registro', 'ItemOP')
    Pesagem = apps.get_model('registro', 'Pesagem')

    for ie in ItemEstrutura.objects.all().iterator():
        if ie.unidade == 'g':
            ie.quantidade_por_lote = (ie.quantidade_por_lote or 0) / KG_TO_G
            ie.unidade = 'kg'
            ie.save(update_fields=['quantidade_por_lote', 'unidade'])

    for io in ItemOP.objects.all().iterator():
        if io.unidade == 'g':
            io.quantidade_necessaria = (io.quantidade_necessaria or 0) / KG_TO_G
            io.quantidade_pesada = (io.quantidade_pesada or 0) / KG_TO_G
            io.unidade = 'kg'
            io.save(update_fields=['quantidade_necessaria', 'quantidade_pesada', 'unidade'])

    for p in Pesagem.objects.all().iterator():
        p.liquido = (p.liquido or 0) / KG_TO_G
        p.save(update_fields=['liquido'])

class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0002_pesagem_lote_mp_and_more'),  # ajuste
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
