const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${cmd.substring(0, 100)}`);
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
    // Teste com Host header correto — apiscale server block tem X-Forwarded-Proto https
    console.log('\n=== Teste HTTP com Host: apiscale.laboratoriosobral.com.br ===');
    await run(conn,
      `wget -q -O- --timeout=15 --server-response ` +
      `--header="Host: apiscale.laboratoriosobral.com.br" ` +
      `--header="Content-Type: application/json" ` +
      `--post-data='{"username":"admin","password":"Scale2026"}' ` +
      `"http://127.0.0.1:8091/api/usuarios/auth/login/?env=prod" 2>&1; echo "EXIT:$?"`
    );

    // Logs do backend
    console.log('\n=== Logs recentes do backend ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose logs --tail=15 backend 2>&1`);

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
