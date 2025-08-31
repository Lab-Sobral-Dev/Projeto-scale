from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0004_alter_itemestrutura_unidade_alter_itemop_unidade_and_more'),  # ajuste
    ]

    operations = [
        migrations.AlterField(
            model_name='itemestrutura',
            name='unidade',
            field=models.CharField(choices=[('g', 'g'), ('kg', 'kg'), ('mL', 'mL'), ('L', 'L'), ('un', 'un')], default='g', max_length=10),
        ),
        migrations.AlterField(
            model_name='itemop',
            name='unidade',
            field=models.CharField(choices=[('g', 'g'), ('kg', 'kg'), ('mL', 'mL'), ('L', 'L'), ('un', 'un')], default='g', help_text='Sempre g.', max_length=10),
        ),
    ]
