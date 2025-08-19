from django.core.management.base import BaseCommand
from django.core.management import call_command

class Command(BaseCommand):
    help = "Importa produtos e matérias-primas em sequência."

    def add_arguments(self, parser):
        parser.add_argument("--produtos", default="registro/bases/produtos.xlsx")
        parser.add_argument("--mps", default="registro/bases/mp.xlsx")

    def handle(self, *args, **opts):
        self.stdout.write(self.style.NOTICE("==> Importando PRODUTOS"))
        call_command("importar_produtos", arquivo=opts["produtos"])
        self.stdout.write(self.style.NOTICE("==> Importando MATÉRIAS-PRIMAS"))
        call_command("importar_mps", arquivo=opts["mps"])
        self.stdout.write(self.style.SUCCESS("Importação concluída."))
