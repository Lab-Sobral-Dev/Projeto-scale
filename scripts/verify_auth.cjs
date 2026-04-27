const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';
const NEW_PASS = process.env.NEW_PASS;

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
    const pyScript = `
from django.contrib.auth import get_user_model, authenticate
User = get_user_model()
u = User.objects.using('default').get(username='admin')
u.set_password('${NEW_PASS}')
u.save(using='default')
ok = authenticate(username='admin', password='${NEW_PASS}')
print('Authenticate OK:', ok is not None)
print('User id:', u.id, 'active:', u.is_active)
`.trim().split('\n').join('; ');

    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "${pyScript}" 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
