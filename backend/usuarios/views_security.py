from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework import status

from .models_security import LoginSecurity
from .permissions import IsAdmin

User = get_user_model()

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

        return Response({"status": "forced", "temporary_password": temp}, status=status.HTTP_200_OK)
