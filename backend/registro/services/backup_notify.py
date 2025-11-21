# apps/registro/services/backup_notify.py
from django.conf import settings
from django.core.mail import send_mail
from django.utils.timezone import localtime


def notify_backup_failure(error_message, rec=None, context=None):
    """
    Envia e-mail de alerta quando um backup falha.
    - error_message: string com o erro principal
    - rec: instancia de BackupRecord (opcional, mas recomendado)
    - context: dict com infos extras (ex.: source, user, etc.)
    """
    context = context or {}

    # Destinatários: PRIORIDADE -> BACKUP_ALERT_EMAILS -> ADMINS
    recipients = getattr(settings, "BACKUP_ALERT_EMAILS", None)
    if isinstance(recipients, str):
        recipients = [r.strip() for r in recipients.split(",") if r.strip()]

    if not recipients:
        admins = getattr(settings, "ADMINS", [])
        recipients = [email for (_name, email) in admins]

    if not recipients:
        # Nenhum destinatário configurado -> não fazemos nada
        return

    prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")
    subject = f"{prefix}Falha no backup do banco".strip()

    lines = [
        "Ocorreu uma FALHA ao executar o backup do banco de dados.\n",
        f"Erro: {error_message}",
        "",
    ]

    if rec is not None:
        lines.append("Detalhes do BackupRecord:")
        lines.append(f"  ID: {rec.id}")
        if rec.created_at:
            lines.append(f"  Data/hora: {localtime(rec.created_at).strftime('%Y-%m-%d %H:%M:%S')}")
        if rec.engine:
            lines.append(f"  Engine: {rec.engine}")
        if rec.output_file:
            lines.append(f"  Arquivo (tentativa): {rec.output_file}")
        if rec.size_bytes:
            lines.append(f"  Tamanho parcial: {rec.size_bytes} bytes")
        lines.append("")

    if context:
        lines.append("Contexto adicional:")
        for k, v in context.items():
            lines.append(f"  {k}: {v}")
        lines.append("")

    body = "\n".join(lines)

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)
    send_mail(
        subject=subject,
        message=body,
        from_email=from_email,
        recipient_list=recipients,
        fail_silently=True,  # se o e-mail falhar não quebra o fluxo
    )
