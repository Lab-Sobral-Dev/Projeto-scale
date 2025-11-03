from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.password_validation import validate_password

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """
    Troca de senha voluntária ou obrigatória (após reset/expiração).
    Requer: current_password, new_password, confirm_password
    """
    user = request.user
    current = request.data.get("current_password")
    new = request.data.get("new_password")
    confirm = request.data.get("confirm_password")

    # senha atual obrigatória (mesmo quando temporária)
    if not user.check_password(current or ""):
        return Response({"detail": "Senha atual incorreta."}, status=status.HTTP_400_BAD_REQUEST)
    if not new or new != confirm:
        return Response({"detail": "Confirmação de senha não confere."}, status=status.HTTP_400_BAD_REQUEST)

    # validadores (MinimumLength, ComplexityValidator, etc.)
    validate_password(new, user)

    # grava
    user.set_password(new)
    user.save(update_fields=["password"])

    # marca troca concluída
    sec = user.security
    sec.mark_password_changed()

    return Response({"status": "password_changed"}, status=status.HTTP_200_OK)
