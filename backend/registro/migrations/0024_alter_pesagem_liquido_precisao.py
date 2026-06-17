from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0023_balanca_casas_decimais_precisao_pesagem'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pesagem',
            name='liquido',
            field=models.DecimalField(
                decimal_places=6,
                default=0.0,
                help_text=(
                    'Armazenado em g (entrada do operador é em kg; o backend converte). '
                    'decimal_places=6 para aceitar a entrada em kg com até 6 casas (precisão da balança).'
                ),
                max_digits=14,
            ),
        ),
    ]
