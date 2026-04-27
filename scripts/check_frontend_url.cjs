const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const JS_FILE = '/usr/share/nginx/html/assets/index-BcM1KDV3.js';

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
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
    console.log('\n=== Check apiscale in built JS ===');
    await run(conn, `docker exec scale_frontend grep -o apiscale ${JS_FILE} | head -1 || echo "NOT FOUND"`);

    console.log('\n=== Check /api relative URL in built JS ===');
    await run(conn, `docker exec scale_frontend grep -o '/api/usuarios' ${JS_FILE} | head -1 || echo "NOT FOUND"`);

    console.log('\n=== First 300 chars of built JS (to see API URL) ===');
    await run(conn, `docker exec scale_frontend head -c 500 ${JS_FILE} 2>&1`);

    console.log('\n\n=== Snippet around auth/login in built JS ===');
    await run(conn, `docker exec scale_frontend grep -o '.\\{0,80\\}auth.login.\\{0,80\\}' ${JS_FILE} | head -3`);

    console.log('\n=== .env.local content ===');
    await run(conn, `cat /home/suporte/projetos/Projeto-scale/frontend/.env.local`);

    console.log('\n=== Container build date vs .env.local date ===');
    await run(conn, `stat /home/suporte/projetos/Projeto-scale/frontend/.env.local | grep Modify`);
    await run(conn, `docker inspect scale_frontend --format "Built: {{.Created}}"`);

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
