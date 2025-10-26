# auth.py
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

class TokenWithScreensSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        perfil = getattr(user, 'perfil', None)
        allowed = perfil.get_allowed_screens() if perfil else []
        token["allowed_screens"] = allowed
        token["username"] = user.username
        return token

class TokenWithScreensView(TokenObtainPairView):
    serializer_class = TokenWithScreensSerializer
