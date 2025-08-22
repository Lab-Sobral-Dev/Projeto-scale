from rest_framework import serializers
from django.contrib.auth.models import User
from .models import PerfilUsuario

class UserSerializer(serializers.ModelSerializer):
    papel = serializers.CharField(source='perfil.papel', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'papel']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    papel = serializers.ChoiceField(choices=PerfilUsuario.PAPEL_CHOICES, write_only=True)

    class Meta:
        model = User
        fields = ['username', 'password', 'first_name', 'last_name', 'email', 'papel']

    def create(self, validated_data):
        papel = validated_data.pop('papel', PerfilUsuario.PAPEL_OPERADOR)
        password = validated_data.pop('password')
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
        return user


class PerfilUsuarioSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)

    class Meta:
        model = PerfilUsuario
        fields = ['id', 'user_id', 'username', 'email', 'papel']
