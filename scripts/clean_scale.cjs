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
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve());
    });
  });
}

const conn = new Client();

conn.on('ready', async () => {
  try {
    // Truncar todas as tabelas de dados (em ordem para respeitar FKs, com CASCADE)
    console.log('\n=== Limpar scale: todas as tabelas de dados ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
-- Primeiro: tabelas que referenciam auth_user
TRUNCATE TABLE registro_auditlog RESTART IDENTITY CASCADE;

-- Segundo: demais tabelas registro
TRUNCATE TABLE
  registro_backuprecord,
  registro_backupconfig,
  registro_pesagem,
  registro_produto,
  registro_materiaprima,
  registro_balanca,
  registro_estruturaproduto,
  registro_itemestrutura,
  registro_itemop,
  registro_ordemproducao
RESTART IDENTITY CASCADE;

-- Terceiro: sessões e tokens
TRUNCATE TABLE django_session RESTART IDENTITY CASCADE;
TRUNCATE TABLE token_blacklist_blacklistedtoken RESTART IDENTITY CASCADE;
TRUNCATE TABLE token_blacklist_outstandingtoken RESTART IDENTITY CASCADE;

-- Quarto: usuarios (já truncados na 1a rodada, mas por segurança)
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

    // Agora auditlog está vazio, podemos deletar usuários não-superuser
    console.log('\n=== Remover usuários de teste (manter apenas admin) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "DELETE FROM auth_user WHERE is_superuser = FALSE;" 2>&1`
    );

    // Verificação final scale
    console.log('\n=== Verificação final scale (deve estar limpo) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
SELECT 'pesagem' as tabela, COUNT(*) FROM registro_pesagem
UNION ALL SELECT 'produto', COUNT(*) FROM registro_produto
UNION ALL SELECT 'auditlog', COUNT(*) FROM registro_auditlog
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user
UNION ALL SELECT 'usuarios_role', COUNT(*) FROM usuarios_role
UNION ALL SELECT 'balanca', COUNT(*) FROM registro_balanca;
" 2>&1`
    );

    // Verificação scale_hml (deve ainda ter dados)
    console.log('\n=== Verificação scale_hml (deve ter todos os dados) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "
SELECT 'pesagem' as tabela, COUNT(*) FROM registro_pesagem
UNION ALL SELECT 'produto', COUNT(*) FROM registro_produto
UNION ALL SELECT 'auditlog', COUNT(*) FROM registro_auditlog
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user
UNION ALL SELECT 'usuarios_role', COUNT(*) FROM usuarios_role;
" 2>&1`
    );

    console.log('\n=== Tamanhos finais ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS tamanho FROM pg_database WHERE datname IN ('scale','scale_hml') ORDER BY datname;" 2>&1`
    );

    console.log('\n\n✅ scale limpo. scale_hml com dados de homologação.');

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
