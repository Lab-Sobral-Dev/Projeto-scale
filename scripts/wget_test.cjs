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
    // Teste 1: wget na porta do nginx Docker (127.0.0.1:8091)
    console.log('\n=== Teste via nginx Docker (porta 8091) ===');
    await run(conn, `wget -q -O- --timeout=10 --header="Content-Type: application/json" --post-data='{"username":"admin","password":"Scale2026"}' "http://127.0.0.1:8091/api/usuarios/auth/login/?env=prod" 2>&1; echo "EXIT:$?"`);

    // Teste 2: verificar CACHES settings
    console.log('\n=== Settings de cache e throttle ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "from django.conf import settings; print('CACHES:', settings.CACHES); print('THROTTLE:', settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES'))" 2>&1`);

    // Teste 3: logs mais recentes incluindo erros
    console.log('\n=== Logs recentes (incluindo erros) ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose logs --tail=20 backend 2>&1`);

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
