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
    // Listar bancos existentes no PostgreSQL
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "\\l" 2>&1`
    );

    // Verificar usuário scale_hml
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "SELECT usename FROM pg_user WHERE usename='scale_hml';" 2>&1`
    );

    // Tamanho do banco scale (produção)
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d postgres -c "SELECT pg_size_pretty(pg_database_size('scale')) AS tamanho_scale;" 2>&1`
    );

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
