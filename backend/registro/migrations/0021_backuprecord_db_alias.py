from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0020_alter_backupconfig_retention_pesagem_lote'),
    ]

    operations = [
        migrations.AddField(
            model_name='backuprecord',
            name='db_alias',
            field=models.CharField(default='default', max_length=20),
        ),
    ]
