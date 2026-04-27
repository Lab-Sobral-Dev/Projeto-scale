const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.substring(0, 120)}`);
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
    // Fix .env.local — overwrite with correct URL
    console.log('\n=== 1. Corrigindo .env.local ===');
    await run(conn, `echo 'VITE_API_BASE_URL=https://apiscale.laboratoriosobral.com.br/api' > ${PROJECT_DIR}/frontend/.env.local`);
    await run(conn, `cat ${PROJECT_DIR}/frontend/.env.local`);

    // Rebuild frontend container
    console.log('\n=== 2. Rebuilding frontend container (aguarde ~2 min) ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose build frontend 2>&1`);

    // Restart the frontend and nginx containers
    console.log('\n=== 3. Reiniciando frontend e nginx ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose up -d frontend nginx 2>&1`);

    // Verify the new build has the correct URL
    console.log('\n=== 4. Verificando URL no novo build ===');
    await run(conn, `docker exec scale_frontend ls /usr/share/nginx/html/assets/*.js | head -2`);
    await run(conn, `docker exec scale_frontend grep -o 'apiscale' /usr/share/nginx/html/assets/*.js | head -2 || echo "ERRO: apiscale nao encontrado"`);

  } catch (e) {
    console.error('\nErro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
