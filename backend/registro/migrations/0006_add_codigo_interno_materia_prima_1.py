from django.db import migrations, models

def populate_codigo_interno(apps, schema_editor):
    MateriaPrima = apps.get_model('registro', 'MateriaPrima')
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
        ('registro', '0005_add_codigo_interno_materia_prima'),  # ajuste aqui
    ]

    operations = [
        # 1) adiciona o campo como opcional (permite popular)
        migrations.AddField(
            model_name='materiaprima',
            name='codigo_interno',
            field=models.CharField(max_length=50, null=True, blank=True),
        ),
        # 2) preenche valores para registros antigos
        migrations.RunPython(populate_codigo_interno, migrations.RunPython.noop),
        # 3) aplica restrições finais
        migrations.AlterField(
            model_name='materiaprima',
            name='codigo_interno',
            field=models.CharField(max_length=50, unique=True, db_index=True),
        ),
    ]
