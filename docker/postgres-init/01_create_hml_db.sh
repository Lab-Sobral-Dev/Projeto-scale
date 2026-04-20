#!/bin/bash
# Cria o banco HML se ainda não existir.
# Executado automaticamente pelo postgres na primeira inicialização do volume.
set -e

HML_DB="${DB_NAME_HML:-scale_hml}"
HML_USER="${DB_USER_HML:-scale_hml}"
HML_PASSWORD="${DB_PASSWORD_HML:-scale_hml}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${HML_USER}') THEN
            CREATE USER ${HML_USER} WITH PASSWORD '${HML_PASSWORD}';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE ${HML_DB} OWNER ${HML_USER}'
    WHERE NOT EXISTS (
        SELECT FROM pg_database WHERE datname = '${HML_DB}'
    )\gexec

    GRANT ALL PRIVILEGES ON DATABASE ${HML_DB} TO ${HML_USER};
EOSQL

echo "Banco HML '${HML_DB}' verificado/criado com sucesso."
