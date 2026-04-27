const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';
const NEW_PASS = process.env.NEW_PASS;
const NEW_USER = process.env.NEW_USER || 'admin';

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
    const pyScript = [
      `from django.contrib.auth import get_user_model, authenticate`,
      `User = get_user_model()`,
      `User.objects.using('default').filter(username='${NEW_USER}').delete()`,
      `u = User.objects.db_manager('default').create_superuser(username='${NEW_USER}', email='suporte@laboratoriosobral.com.br', password='${NEW_PASS}')`,
      `print('Criado: id=', u.id, 'username=', u.username, 'superuser=', u.is_superuser)`,
      `ok = authenticate(username='${NEW_USER}', password='${NEW_PASS}')`,
      `print('Authenticate OK:', ok is not None)`,
    ].join('; ');

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
