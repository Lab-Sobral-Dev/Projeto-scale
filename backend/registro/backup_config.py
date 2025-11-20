from datetime import time

from django.conf import settings
from django.db import models
from django.utils import timezone

from django_celery_beat.models import PeriodicTask, CrontabSchedule, IntervalSchedule


class BackupConfig(models.Model):
    SCHEDULE_CHOICES = [
        ("daily", "Diário em horário fixo"),
        ("interval", "Intervalo em horas"),
    ]

    enabled = models.BooleanField("Backup automático ativo", default=False)
    schedule_type = models.CharField(
        "Tipo de agendamento",
        max_length=20,
        choices=SCHEDULE_CHOICES,
        default="daily",
    )
    # usado quando schedule_type = daily
    time_of_day = models.TimeField(
        "Horário (hora local)",
        default=time(3, 0),
        help_text="Horário diário para execução do backup.",
    )
    # usado quando schedule_type = interval
    interval_hours = models.PositiveIntegerField(
        "Intervalo (horas)",
        default=24,
        help_text="Executa a cada X horas (usado no modo Intervalo).",
    )

    # extras que podem ser úteis depois
    retention_days = models.PositiveIntegerField(
        "Retenção (dias)",
        default=30,
        help_text="(Futuro) Quantos dias manter backups antes de limpeza automática.",
    )

    # só para controle visual
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração de Backup Automático"
        verbose_name_plural = "Configuração de Backup Automático"

    def __str__(self):
        return "Configuração de Backup"

    # --- Sincroniza com django-celery-beat ---

    PERIODIC_TASK_NAME = "backup-auto-scale"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.sync_periodic_task()

    def sync_periodic_task(self):
        """
        Cria/atualiza o PeriodicTask que chama registro.tasks.auto_backup
        conforme os campos de configuração.
        """
        from registro.tasks.tasks import auto_backup  # garante import

        # Se desabilitado, só desliga o PeriodicTask
        try:
            pt = PeriodicTask.objects.get(name=self.PERIODIC_TASK_NAME)
        except PeriodicTask.DoesNotExist:
            pt = None

        if not self.enabled:
            if pt:
                pt.enabled = False
                pt.save()
            return

        # Habilitado: escolhe o tipo de agenda
        if self.schedule_type == "daily":
            # agenda diária no horário configurado
            local_tz = timezone.get_current_timezone()
            schedule, _ = CrontabSchedule.objects.get_or_create(
                minute=str(self.time_of_day.minute),
                hour=str(self.time_of_day.hour),
                day_of_week="*",
                day_of_month="*",
                month_of_year="*",
                timezone=str(local_tz),
            )
            interval = None
        else:
            # intervalo em horas
            schedule = None
            interval, _ = IntervalSchedule.objects.get_or_create(
                every=self.interval_hours,
                period=IntervalSchedule.HOURS,
            )

        defaults = {
            "task": "apps.registro.tasks.auto_backup",
            "enabled": True,
            "crontab": schedule,
            "interval": interval,
            "one_off": False,
        }

        if pt:
            for k, v in defaults.items():
                setattr(pt, k, v)
            pt.save()
        else:
            PeriodicTask.objects.create(
                name=self.PERIODIC_TASK_NAME,
                **defaults,
            )
