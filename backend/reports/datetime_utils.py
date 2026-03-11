from datetime import date, datetime, time
from zoneinfo import ZoneInfo
from django.utils import timezone

GMT3_TZ = ZoneInfo("America/Sao_Paulo")


def to_gmt3(dt):
    if not dt:
        return None
    if isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, time.min)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return timezone.localtime(dt, GMT3_TZ)


def fmt_gmt3(dt, fmt="%Y-%m-%d %H:%M"):
    local_dt = to_gmt3(dt)
    return local_dt.strftime(fmt) if local_dt else ""


def fmt_gmt3_with_zone(dt):
    local_dt = to_gmt3(dt)
    return local_dt.strftime("%Y-%m-%d %H:%M GMT-3") if local_dt else ""