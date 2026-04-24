from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("registro", "0016_backuprecord_auditlog"),
    ]

    operations = [
        # M-1: item_op não deve aceitar null — invariante de negócio já validada em _save_atomic
        migrations.AlterField(
            model_name="pesagem",
            name="item_op",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="pesagens",
                to="registro.itemop",
            ),
        ),
        # M-2: remover default='TEMP' — pesagens não devem ser salvas com código placeholder
        migrations.AlterField(
            model_name="pesagem",
            name="codigo_interno",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
