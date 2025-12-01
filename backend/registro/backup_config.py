# backend/registro/backup_config.py
from datetime import time
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
    time_of_day = models.TimeField(
        "Horário (hora local)",
        default=time(3, 0),
        help_text="Horário diário para execução do backup.",
    )
    interval_hours = models.PositiveIntegerField(
        "Intervalo (horas)",
        default=24,
        help_text="Executa a cada X horas (usado no modo Intervalo).",
    )
    retention_days = models.PositiveIntegerField(
        "Retenção (dias)",
        default=30,
        help_text="Quantos dias manter backups antes de deletar.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração de Backup Automático"
        verbose_name_plural = "Configuração de Backup Automático"

    def __str__(self):
        return "Configuração de Backup"

    PERIODIC_TASK_NAME = "backup-auto-scale"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.sync_periodic_task()

    def sync_periodic_task(self):
        """
        Sincroniza com o django-celery-beat.
        """
        # Se desabilitado, desativa a task no Celery
        try:
            pt = PeriodicTask.objects.get(name=self.PERIODIC_TASK_NAME)
        except PeriodicTask.DoesNotExist:
            pt = None

        if not self.enabled:
            if pt:
                pt.enabled = False
                pt.save()
            return

        # Define o Schedule (Cron ou Intervalo)
        if self.schedule_type == "daily":
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
            schedule = None
            interval, _ = IntervalSchedule.objects.get_or_create(
                every=self.interval_hours,
                period=IntervalSchedule.HOURS,
            )

        # CORREÇÃO: Nome da task deve bater com o @shared_task(name=...)
        defaults = {
            "task": "registro.auto_backup",  # <--- Nome exato definido no tasks.py
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