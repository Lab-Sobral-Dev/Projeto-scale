from django.db import migrations, models


def preencher_calibracao_realizada(apps, schema_editor):
    Balanca = apps.get_model('registro', 'Balanca')
    Balanca.objects.filter(ultima_calibracao__isnull=False).update(calibracao_realizada=True)


class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0009_backupconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='balanca',
            name='frequencia_calibracao_dias',
            field=models.PositiveIntegerField(default=365),
        ),
        migrations.AddField(
            model_name='balanca',
            name='calibracao_realizada',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(preencher_calibracao_realizada, migrations.RunPython.noop),
    ]