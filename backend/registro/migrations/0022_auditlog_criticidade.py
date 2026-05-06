from django.db import migrations, models


def backfill_criticidade(apps, schema_editor):
    AuditLog = apps.get_model('registro', 'AuditLog')
    AuditLog.objects.filter(
        action__in=['request', 'token_refresh', 'error']
    ).update(criticidade='baixa')


class Migration(migrations.Migration):

    dependencies = [
        ('registro', '0021_backuprecord_db_alias'),
    ]

    operations = [
        migrations.AddField(
            model_name='auditlog',
            name='criticidade',
            field=models.CharField(
                choices=[('alta', 'Alta'), ('baixa', 'Baixa')],
                default='alta',
                db_index=True,
                max_length=5,
                verbose_name='Criticidade',
            ),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(
                fields=['criticidade', '-timestamp'],
                name='auditlog_critica_ts_idx',
            ),
        ),
        migrations.RunPython(backfill_criticidade, migrations.RunPython.noop),
    ]
