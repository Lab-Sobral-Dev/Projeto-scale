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
    // Verificar o nginx do HOST (não o Docker)
    console.log('\n=== Nginx do host: sites-enabled ===');
    await run(conn, `ls /etc/nginx/sites-enabled/ 2>&1`);

    console.log('\n=== Config apiscale no host nginx ===');
    await run(conn, `cat /etc/nginx/sites-enabled/apiscale.laboratoriosobral.com.br 2>/dev/null || cat /etc/nginx/sites-enabled/default 2>/dev/null || echo "Arquivo não encontrado"`);

    console.log('\n=== Portas abertas no host ===');
    await run(conn, `ss -tlnp 2>/dev/null | grep -E ':80|:443|:8091' || netstat -tlnp 2>/dev/null | grep -E ':80|:443|:8091'`);

    // Logs recentes do backend para ver requisições do Chrome
    console.log('\n=== Logs backend (últimas 30 linhas) ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose logs --tail=30 backend 2>&1 | grep -E "(POST|GET|401|200|301|ERROR)" | tail -20`);

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
