import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0022_auditlog_criticidade'),
    ]

    operations = [
        migrations.AddField(
            model_name='balanca',
            name='casas_decimais',
            field=models.PositiveSmallIntegerField(
                default=3,
                help_text='Número de casas decimais (em kg) que a balança consegue medir. Define a precisão exibida e aceita na pesagem.',
                validators=[
                    django.core.validators.MinValueValidator(0),
                    django.core.validators.MaxValueValidator(6),
                ],
            ),
        ),
        migrations.AlterField(
            model_name='pesagem',
            name='bruto',
            field=models.DecimalField(
                decimal_places=6,
                help_text='Calculado automaticamente no backend (kg): tara_kg + liquido_kg.',
                max_digits=14,
            ),
        ),
        migrations.AlterField(
            model_name='pesagem',
            name='tara',
            field=models.DecimalField(
                decimal_places=6,
                help_text='Entrada do operador em kg.',
                max_digits=14,
            ),
        ),
    ]
