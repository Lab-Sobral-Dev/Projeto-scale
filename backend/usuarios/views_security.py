from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils.crypto import get_random_string
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework import status

from .models_security import LoginSecurity
from .permissions import IsAdmin

User = get_user_model()


def _send_temp_password(user, temp_password, admin_user):
    """Send temp password by email. Returns True if sent, False otherwise."""
    recipient = user.email or (admin_user.email if admin_user else None)
    if not recipient:
        return False
    prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "")
    subject = f"{prefix}Redefinição de senha — {user.username}".strip()
    if user.email:
        body = (
            f"Olá {user.get_full_name() or user.username},\n\n"
            f"Sua senha foi redefinida por um administrador.\n"
            f"Senha temporária: {temp_password}\n\n"
            f"Você deverá alterar sua senha no próximo acesso.\n"
        )
    else:
        body = (
            f"[Aviso ao administrador {admin_user.username}]\n\n"
            f"A senha de {user.username} foi redefinida.\n"
            f"Usuário não possui e-mail cadastrado — entregue a senha por canal seguro.\n"
            f"Senha temporária: {temp_password}\n\n"
            f"O usuário deverá alterar a senha no próximo acesso.\n"
        )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)
    send_mail(subject=subject, message=body, from_email=from_email,
              recipient_list=[recipient], fail_silently=True)
    return True


class UserSecurityView(ViewSet):
    permission_classes = [IsAdmin]

    def retrieve(self, request, pk=None):
        user = User.objects.get(pk=pk)
        sec, _ = LoginSecurity.objects.get_or_create(user=user)
        data = {
            "id": user.id,
            "username": user.username,
            "is_locked": sec.is_locked,
            "failed_logins": sec.failed_logins,
            "locked_at": sec.locked_at,
            "last_password_change": sec.last_password_change,
            "expires_at": sec.password_expires_at(),
            "must_change_password": sec.must_change_password,
        }
        return Response(data)

    def unlock(self, request, pk=None):
        user = User.objects.get(pk=pk)
        sec, _ = LoginSecurity.objects.get_or_create(user=user)
        sec.reset_lock()
        return Response({"status": "unlocked"})

    def force_reset(self, request, pk=None):
        """
        Gera senha temporária OU usa a enviada no payload.
        Marca must_change_password=True.
        Envia a senha por e-mail em vez de retorná-la na resposta.
        """
        user = User.objects.get(pk=pk)
        sec, _ = LoginSecurity.objects.get_or_create(user=user)

        temp = request.data.get("temporary_password") or get_random_string(12)
        user.set_password(temp)
        user.save(update_fields=["password"])

        sec.must_change_password = True
        sec.failed_logins = 0
        sec.is_locked = False
        sec.locked_at = None
        sec.save(update_fields=["must_change_password", "failed_logins", "is_locked", "locked_at"])

        email_sent = _send_temp_password(user, temp, request.user)

        return Response({
            "status": "forced",
            "email_sent": email_sent,
        }, status=status.HTTP_200_OK)
