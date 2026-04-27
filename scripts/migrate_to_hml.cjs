const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function run(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', d => { stdout += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { stderr += d; process.stderr.write(d); });
      stream.on('close', (code) => {
        if (opts.failOnError && (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('fatal'))) {
          return reject(new Error(`Command failed: ${stderr}`));
        }
        resolve({ stdout, stderr, code });
      });
    });
  });
}

const conn = new Client();

conn.on('ready', async () => {
  try {
    console.log('\n=== PASSO 1: Criar usuário scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "CREATE USER scale_hml WITH PASSWORD 'scale_hml';" 2>&1`
    );

    console.log('\n=== PASSO 2: Criar banco scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "CREATE DATABASE scale_hml OWNER suporte;" 2>&1`
    );

    console.log('\n=== PASSO 3: Conceder permissões ao scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE scale_hml TO scale_hml;" 2>&1`
    );
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "GRANT ALL ON SCHEMA public TO scale_hml;" 2>&1`
    );

    console.log('\n=== PASSO 4: Copiar dados de scale → scale_hml (pg_dump | psql) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db bash -c "pg_dump -U suporte scale | psql -U suporte scale_hml" 2>&1`
    );

    console.log('\n=== PASSO 5: Verificar tabelas em scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1`
    );

    console.log('\n=== PASSO 6: Verificar contagem de registros em scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "SELECT 'registro_pesagem' as tabela, COUNT(*) FROM registro_pesagem UNION ALL SELECT 'registro_produto', COUNT(*) FROM registro_produto UNION ALL SELECT 'usuarios_usuario', COUNT(*) FROM usuarios_usuario UNION ALL SELECT 'registro_auditlog', COUNT(*) FROM registro_auditlog;" 2>&1`
    );

    console.log('\n=== PASSO 7: Limpar tabelas de dados em scale (manter schema e migrations) ===');
    // Truncar todas as tabelas de dados, respeitando FKs com CASCADE
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
TRUNCATE TABLE
  registro_auditlog,
  registro_backuprecord,
  registro_pesagem,
  registro_produto,
  registro_produto_materias_primas,
  registro_materia_prima,
  registro_backupconfig
RESTART IDENTITY CASCADE;
" 2>&1`
    );

    // Truncar tabelas de usuários (manter superusuário se necessário)
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
TRUNCATE TABLE
  usuarios_loginsecurity,
  usuarios_role_screens,
  usuarios_perfilusuario_roles,
  usuarios_perfilusuario,
  usuarios_role,
  usuarios_screen
RESTART IDENTITY CASCADE;
" 2>&1`
    );

    // Truncar usuários mas manter o superusuário (para não perder acesso ao admin)
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "DELETE FROM usuarios_usuario WHERE is_superuser = FALSE;" 2>&1`
    );

    console.log('\n=== PASSO 8: Verificar scale após limpeza ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT 'registro_pesagem' as tabela, COUNT(*) FROM registro_pesagem UNION ALL SELECT 'registro_produto', COUNT(*) FROM registro_produto UNION ALL SELECT 'usuarios_usuario', COUNT(*) FROM usuarios_usuario UNION ALL SELECT 'registro_auditlog', COUNT(*) FROM registro_auditlog;" 2>&1`
    );

    console.log('\n=== PASSO 9: Migrar banco HML via Django ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py migrate --database=hml --noinput 2>&1`
    );

    console.log('\n=== PASSO 10: Tamanhos finais ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS tamanho FROM pg_database WHERE datname IN ('scale','scale_hml') ORDER BY datname;" 2>&1`
    );

    console.log('\n\n✅ CONCLUÍDO — scale_hml populado, scale limpo (superusuário mantido).');

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
