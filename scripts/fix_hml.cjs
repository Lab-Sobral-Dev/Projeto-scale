const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve(out));
    });
  });
}

const conn = new Client();

conn.on('ready', async () => {
  try {
    // Listar tabelas reais no banco scale
    console.log('\n=== Tabelas reais em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1`
    );

    // Corrigir permissões: grant em todas as tabelas de scale_hml para o usuário scale_hml
    console.log('\n=== Corrigir permissões do usuário scale_hml em scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO scale_hml; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO scale_hml; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO scale_hml; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO scale_hml;" 2>&1`
    );

    // Truncar tabelas registro em scale (sem a tabela inexistente)
    console.log('\n=== Truncar tabelas registro em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
TRUNCATE TABLE
  registro_auditlog,
  registro_backuprecord,
  registro_pesagem,
  registro_produto,
  registro_materia_prima,
  registro_backupconfig
RESTART IDENTITY CASCADE;
" 2>&1`
    );

    // Verificar usuários existentes em scale (qual é a tabela real)
    console.log('\n=== Verificar auth_user em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT id, username, email, is_superuser FROM auth_user;" 2>&1`
    );

    // Manter apenas superusuário na auth_user
    console.log('\n=== Limpar usuários não-superuser em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "DELETE FROM auth_user WHERE is_superuser = FALSE;" 2>&1`
    );

    // Rodar migrations no banco HML
    console.log('\n=== Migrations no banco HML ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py migrate --database=hml --noinput 2>&1`
    );

    // Verificação final
    console.log('\n=== Contagens finais em scale (deve estar limpo) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
SELECT 'pesagem' as tabela, COUNT(*) FROM registro_pesagem
UNION ALL SELECT 'produto', COUNT(*) FROM registro_produto
UNION ALL SELECT 'auditlog', COUNT(*) FROM registro_auditlog
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user;
" 2>&1`
    );

    console.log('\n=== Contagens finais em scale_hml (deve ter dados) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "
SELECT 'pesagem' as tabela, COUNT(*) FROM registro_pesagem
UNION ALL SELECT 'produto', COUNT(*) FROM registro_produto
UNION ALL SELECT 'auditlog', COUNT(*) FROM registro_auditlog
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user;
" 2>&1`
    );

    console.log('\n=== Tamanhos finais ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS tamanho FROM pg_database WHERE datname IN ('scale','scale_hml') ORDER BY datname;" 2>&1`
    );

    console.log('\n\n✅ CONCLUÍDO.');

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
