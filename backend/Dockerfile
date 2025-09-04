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
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Código do app
COPY . .

# Porta interna
EXPOSE 8000

# Sobe migrando, coleta estáticos e inicia Gunicorn
# IMPORTANTE: use o módulo WSGI correto do seu projeto -> conf.wsgi:application
CMD ["sh", "-lc", "\
python manage.py migrate && \
python manage.py collectstatic --noinput && \
gunicorn conf.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120 --access-logfile - --error-logfile - \
"]
