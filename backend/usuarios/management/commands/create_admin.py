import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from usuarios.models import PerfilUsuario


class Command(BaseCommand):
    help = "Cria um superusuário admin se não existir. Lê ADMIN_USERNAME/ADMIN_EMAIL/ADMIN_PASSWORD do env ou args."

    def add_arguments(self, parser):
        parser.add_argument("--username", default=None)
        parser.add_argument("--email", default=None)
        parser.add_argument("--password", default=None)

    def handle(self, *args, **options):
        User = get_user_model()

        username = options["username"] or os.environ.get("ADMIN_USERNAME", "admin")
        email    = options["email"]    or os.environ.get("ADMIN_EMAIL", "admin@example.com")
        password = options["password"] or os.environ.get("ADMIN_PASSWORD")

        if not password:
            raise CommandError(
                "Informe a senha via --password ou variável de ambiente ADMIN_PASSWORD."
            )

        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(f"Usuário '{username}' já existe. Nenhuma alteração feita."))
            return

        user = User.objects.create_superuser(username=username, email=email, password=password)

        perfil = PerfilUsuario.objects.get(user=user)
        perfil.papel = PerfilUsuario.PAPEL_ADMIN
        perfil.save()

        self.stdout.write(self.style.SUCCESS(f"Admin '{username}' criado com sucesso."))
