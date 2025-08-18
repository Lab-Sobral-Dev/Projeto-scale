from django.db import migrations, models

def populate_codigo_interno(apps, schema_editor):
    MateriaPrima = apps.get_model('registro', 'MateriaPrima')

    # Estratégia simples: "MP-0001", "MP-0002", ... na ordem do ID
    used = set(
        MateriaPrima.objects
        .exclude(codigo_interno__isnull=True)
        .exclude(codigo_interno__exact='')
        .values_list('codigo_interno', flat=True)
    )

    for mp in MateriaPrima.objects.all().order_by('id'):
        if mp.codigo_interno:
            continue
        base = f"MP-{mp.id:04d}"
        code = base
        i = 1
        while code in used:
            i += 1
            code = f"{base}-{i}"
        mp.codigo_interno = code
        mp.save(update_fields=['codigo_interno'])
        used.add(code)

class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0004_alter_pesagem_balanca'),  # ajuste para sua última migração
    ]

    operations = [
        # 1) adiciona o campo como NULL/blank e sem unique para permitir povoar
        migrations.AddField(
            model_name='materiaprima',
            name='codigo_interno',
            field=models.CharField(max_length=50, null=True, blank=True),
        ),
        # 2) popula todos os registros existentes com valores únicos
        migrations.RunPython(populate_codigo_interno, migrations.RunPython.noop),
        # 3) aplica as restrições finais
        migrations.AlterField(
            model_name='materiaprima',
            name='codigo_interno',
            field=models.CharField(max_length=50, unique=True),
        ),
        # (opcional) índice para busca
        migrations.AlterField(
            model_name='materiaprima',
            name='codigo_interno',
            field=models.CharField(max_length=50, unique=True, db_index=True),
        ),
    ]
