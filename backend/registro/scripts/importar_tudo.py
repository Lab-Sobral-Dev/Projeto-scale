"""
Atalho para rodar o importador por código.
Uso (exemplos):

python manage.py shell < registro/scripts/importar_tudo.py
# ou dentro de um shell:
from registro.scripts.importar_tudo import run
run()
"""
from django.core.management import call_command

def run():
    call_command("importar_tudo")  # aceita --produtos e --mps se desejar
