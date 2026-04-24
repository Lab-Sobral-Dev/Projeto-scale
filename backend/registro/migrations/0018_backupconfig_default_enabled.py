from django.db import migrations


def enable_backup_config(apps, schema_editor):
    BackupConfig = apps.get_model("registro", "BackupConfig")
    obj, created = BackupConfig.objects.using(schema_editor.connection.alias).get_or_create(
        pk=1,
        defaults={"enabled": True},
    )
    if not created and not obj.enabled:
        obj.enabled = True
        obj.save(update_fields=["enabled"])


class Migration(migrations.Migration):

    dependencies = [
        ("registro", "0017_fix_pesagem_item_op_and_codigo_interno"),
    ]

    operations = [
        migrations.RunPython(enable_backup_config, migrations.RunPython.noop),
    ]
