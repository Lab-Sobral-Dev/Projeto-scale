# === Backend (Django + Gunicorn) ===
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependências do sistema (psycopg2, compilação, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc build-essential libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# Dependências Python
# (garanta que requirements.txt esteja na pasta backend)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Código do app
COPY . .

# Coleta de estáticos (se o settings estiver correto para isso)
# Se preferir fazer no entrypoint/migrate job, pode remover esta linha.
RUN python manage.py collectstatic --noinput || true

# Porta interna
EXPOSE 8000

# Dica: troque o módulo WSGI abaixo se o seu projeto tiver outro nome
# Você também pode definir WSGI_MODULE no .env e usar: ${WSGI_MODULE:-scale_project.wsgi:application}
CMD ["gunicorn", "scale_project.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
