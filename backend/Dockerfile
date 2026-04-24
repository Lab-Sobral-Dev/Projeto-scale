# === Backend (Django + Gunicorn) ===
FROM python:3.12-slim

# Variáveis de ambiente para otimização do Python e configuração de caminhos
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    BACKUP_DIR=/var/backups/scale \
    BACKUP_ACCEL_PREFIX=/protected/backups

WORKDIR /app

# Dependências do sistema
# A inclusão de 'postgresql-client' é CRÍTICA para o funcionamento dos backups (pg_dump)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    libpq-dev \
    postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# Dependências Python
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copia o código da aplicação
COPY . .

# Criação de diretórios de logs e backups com permissões adequadas
RUN mkdir -p /var/log/scale_hml && mkdir -p ${BACKUP_DIR}

# Usuário não-root para reduzir superfície de ataque
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser && \
    chown -R appuser:appgroup /app /var/log/scale_hml ${BACKUP_DIR}

USER appuser

# Porta interna do container
EXPOSE 8000

# Script de inicialização:
# 1. Aplica migrações
# 2. Coleta arquivos estáticos
# 3. Inicia o servidor Gunicorn
CMD ["sh", "-lc", "\
    python manage.py migrate && \
    python manage.py collectstatic --noinput && \
    gunicorn conf.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120 --access-logfile - --error-logfile - \
"]