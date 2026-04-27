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
    // 1. Verificar admin no banco scale (prod)
    console.log('\n=== 1. Estado do admin em scale (prod) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT id, username, email, is_active, is_superuser, LEFT(password, 20) as hash_prefix FROM auth_user WHERE username='admin';" 2>&1`
    );

    // 2. Verificar LoginSecurity (lock)
    console.log('\n=== 2. LoginSecurity (bloqueios) em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT u.username, ls.failed_logins, ls.is_locked, ls.locked_at FROM usuarios_loginsecurity ls JOIN auth_user u ON u.id = ls.user_id;" 2>&1`
    );

    // 3. Definir nova senha E desbloquear via shell do Django
    console.log('\n=== 3. Resetar senha e desbloquear admin ===');
    const pyScript = [
      "import django",
      "from django.contrib.auth import get_user_model, authenticate",
      "User = get_user_model()",
      "u = User.objects.using('default').get(username='admin')",
      "u.set_password('" + NEW_PASS + "')",
      "u.save(using='default')",
      "print('Senha definida. Hash:', u.password[:30])",
      "# Limpar LoginSecurity",
      "from usuarios.models_security import LoginSecurity",
      "LoginSecurity.objects.using('default').filter(user=u).update(failed_logins=0, is_locked=False, locked_at=None)",
      "print('LoginSecurity resetado.')",
      "# Testar autenticação",
      "ok = authenticate(username='admin', password='" + NEW_PASS + "')",
      "print('Authenticate OK:', ok is not None)",
    ].join('; ');

    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "${pyScript}" 2>&1`
    );

    // 4. Confirmar no banco
    console.log('\n=== 4. Confirmar no banco scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT u.username, u.is_active, u.is_superuser, COALESCE(ls.failed_logins,0) as failed, COALESCE(ls.is_locked, false) as locked FROM auth_user u LEFT JOIN usuarios_loginsecurity ls ON ls.user_id = u.id WHERE u.username='admin';" 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
