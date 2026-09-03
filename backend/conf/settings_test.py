"""
Settings para execução da suíte de testes.

USO
    python manage.py test --settings=conf.settings_test

POR QUE ESTE ARQUIVO EXISTE
    O test runner do Django cria um banco novo e aplica TODAS as migrations
    do zero. Isso hoje falha:

        django.db.utils.OperationalError: table "registro_auditlog" already exists

    Causa: `registro/migrations/0009_auditlog.py` e
    `registro/migrations/0016_backuprecord_auditlog.py` fazem, as duas,
    CreateModel de AuditLog — e `0013_backuprecord.py` e `0016` fazem, as duas,
    CreateModel de BackupRecord. Os campos de AuditLog em 0016 são idênticos
    aos de 0009: é duplicação pura, sem campo novo.

    Produção não sofre porque migrou incrementalmente (ou 0016 foi aplicada com
    --fake). Mas qualquer banco construído do zero — o de teste, um deploy
    limpo, um CI — não consegue subir.

    Desabilitar MIGRATION_MODULES faz o Django montar o schema direto dos
    models (estilo syncdb), sem passar pelas migrations. A suíte volta a rodar
    sem que ninguém encoste no histórico de migrations já aplicado em produção.

O QUE ISTO **NÃO** RESOLVE
    A duplicação continua lá. Um deploy em banco vazio ou um CI que rode
    `migrate` vai quebrar do mesmo jeito. Este arquivo destrava os testes; a
    correção das migrations 0009/0013/0016 segue pendente e é decisão separada,
    porque mexer em histórico de migration altera o comportamento de deploy.

    Como efeito colateral, a suíte deixa de exercitar as migrations. Elas
    passam a ser verificadas só no deploy — mais um motivo para corrigir a
    duplicação em vez de conviver com ela.
"""
import os

# Definidos ANTES de importar conf.settings, que lê estes valores com os.getenv
# no momento do import.
#
# DB_ENGINE=sqlite: o default é postgres apontando para DB_HOST=db, que só
#   resolve dentro do docker compose. Com sqlite a suíte roda em qualquer lugar.
#   Sobrescreva (DB_ENGINE=postgres) para rodar com paridade de produção.
# AUDIT_ENABLED=false: settings.py monta um RotatingFileHandler em
#   /var/log/scale_hml/audit_app.log (caminho de container). Fora dele o
#   dictConfig falha no import com "Unable to configure handler audit_file".
os.environ.setdefault("DB_ENGINE", "sqlite")
os.environ.setdefault("AUDIT_ENABLED", "false")
os.environ.setdefault("SECRET_KEY", "apenas-para-testes-nao-e-segredo-real")

from conf.settings import *  # noqa: F403,E402  (base de configuração)


class DesabilitaMigrations:
    """Faz o Django tratar todo app como se não tivesse migrations.

    `__contains__` sempre True e `__getitem__` sempre None é o contrato que o
    Django espera para "este app não tem migrations" — o schema então é criado
    a partir dos models.
    """

    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None


MIGRATION_MODULES = DesabilitaMigrations()

# ---------------------------------------------------------------------------
# Segurança HTTPS desligada na suíte
# ---------------------------------------------------------------------------
# O test client faz requisição HTTP simples. Com SECURE_SSL_REDIRECT ligado,
# TODA chamada de API responde 301 antes de chegar na view, e a suíte falha em
# massa com "301 != 200".
#
# Forçado aqui, e não por variável de ambiente, de propósito: settings.py liga
# isso quando DJANGO_HTTPS_PROXY está definida, e essa variável pode existir na
# máquina de quem roda os testes (foi o caso ao introduzir este arquivo). A
# suíte não pode depender do ambiente ambiente de cada desenvolvedor.
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# O hasher de produção (PBKDF2) é deliberadamente lento; em suíte que cria
# usuário por teste ele domina o tempo total.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
