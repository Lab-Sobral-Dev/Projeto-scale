from rest_framework import serializers
from django.contrib.auth.models import User
from .models import PerfilUsuario, Screen, Role

class ScreenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Screen
        fields = ["id", "code", "label"]


class RoleSerializer(serializers.ModelSerializer):
    screens = ScreenSerializer(many=True, read_only=True)
    screen_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Screen.objects.all(), source="screens", required=False
    )

    class Meta:
        model = Role
        fields = ["id", "name", "screens", "screen_ids"]


class UserSerializer(serializers.ModelSerializer):
    papel = serializers.CharField(source='perfil.papel', read_only=True)
    allowed_screens = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'papel', 'allowed_screens']

    def get_allowed_screens(self, obj):
        perfil = getattr(obj, 'perfil', None)
        if not perfil:
            return []
        return perfil.get_allowed_screens()


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    papel = serializers.ChoiceField(choices=PerfilUsuario.PAPEL_CHOICES, write_only=True)
    # Novo: atribuição na criação
    role_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Role.objects.all(), required=False
    )
    extra_screen_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Screen.objects.all(), required=False
    )

    class Meta:
        model = User
        fields = ['username', 'password', 'first_name', 'last_name', 'email', 'papel',
                  'role_ids', 'extra_screen_ids']

    def create(self, validated_data):
        papel = validated_data.pop('papel', PerfilUsuario.PAPEL_OPERADOR)
        password = validated_data.pop('password')
        role_ids = validated_data.pop('role_ids', [])
        extra_screen_ids = validated_data.pop('extra_screen_ids', [])

        user = User(**validated_data)
        user.set_password(password)
        # se papel = 'admin', também marcar is_staff = True (admin do sistema)
        if papel == PerfilUsuario.PAPEL_ADMIN:
            user.is_staff = True
        user.save()

        # cria/atualiza o perfil com o papel escolhido
        perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
        perfil.papel = papel
        perfil.save()

        if role_ids:
            perfil.roles.set(role_ids)
        if extra_screen_ids:
            perfil.extra_screens.set(extra_screen_ids)

        return user


class PerfilUsuarioSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    roles = RoleSerializer(many=True, read_only=True)
    extra_screens = ScreenSerializer(many=True, read_only=True)
    allowed_screens = serializers.SerializerMethodField()

    class Meta:
        model = PerfilUsuario
        fields = ['id', 'user_id', 'username', 'email', 'papel',
                  'roles', 'extra_screens', 'allowed_screens']

    def get_allowed_screens(self, obj):
        return obj.get_allowed_screens()


class PerfilUsuarioUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para PUT/PATCH do perfil (admin consegue ajustar papéis e telas extras).
    """
    role_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Role.objects.all(), source="roles", required=False
    )
    extra_screen_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Screen.objects.all(), source="extra_screens", required=False
    )

    class Meta:
        model = PerfilUsuario
        fields = ['papel', 'role_ids', 'extra_screen_ids']
