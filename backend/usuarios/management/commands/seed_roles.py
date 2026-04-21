from django.conf import settings
from django.core.management.base import BaseCommand

from usuarios.models import Role, Screen


class Command(BaseCommand):
    help = "Cria/atualiza telas e roles padrão (admin/supervisor/operador) a partir de SCREENS_REGISTRY e ROLE_DEFAULT_SCREENS."

    def add_arguments(self, parser):
        parser.add_argument(
            "--database",
            default="default",
            help="Banco de dados alvo (default: default). Use 'hml' para homologação.",
        )

    def handle(self, *args, **options):
        using = options["database"]

        registry = getattr(settings, "SCREENS_REGISTRY", None)
        if not registry:
            self.stdout.write(self.style.WARNING("SCREENS_REGISTRY não definido em settings. Nenhuma tela criada."))
            return

        # 1. Criar/atualizar telas
        created_count = 0
        for code, label in registry:
            _, created = Screen.objects.using(using).get_or_create(code=code, defaults={"label": label})
            if created:
                created_count += 1

        self.stdout.write(f"Telas: {created_count} criada(s), {len(registry) - created_count} já existia(m).")

        # 2. Admin recebe todas
        admin_role, _ = Role.objects.using(using).get_or_create(name="admin")
        all_screens = list(Screen.objects.using(using).all())
        admin_role.screens.set(all_screens)
        self.stdout.write(self.style.SUCCESS(f"Role 'admin': {len(all_screens)} tela(s) atribuída(s)."))

        # 3. Demais roles com telas padrão
        role_defaults = getattr(settings, "ROLE_DEFAULT_SCREENS", {})
        for role_name, screen_codes in role_defaults.items():
            role, _ = Role.objects.using(using).get_or_create(name=role_name)
            screens = list(Screen.objects.using(using).filter(code__in=screen_codes))
            current_ids = set(role.screens.using(using).values_list("id", flat=True))
            to_add = [s for s in screens if s.id not in current_ids]
            if to_add:
                role.screens.add(*to_add)
            self.stdout.write(
                self.style.SUCCESS(f"Role '{role_name}': {len(screens)} tela(s) configurada(s) ({len(to_add)} nova(s)).")
            )

        self.stdout.write(self.style.SUCCESS("Seed de roles concluído."))
