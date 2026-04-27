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
    // Teste 1: login prod via curl direto no container (bypass nginx)
    console.log('\n=== Teste 1: curl direto no container backend (prod) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend curl -s -X POST http://localhost:8000/api/usuarios/auth/login/?env=prod -H "Content-Type: application/json" -d '{"username":"admin","password":"@cesso06597"}' 2>&1`
    );

    // Teste 2: login hml via curl direto
    console.log('\n=== Teste 2: curl direto no container backend (hml) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend curl -s -X POST http://localhost:8000/api/usuarios/auth/login/?env=hml -H "Content-Type: application/json" -d '{"username":"admin","password":"@cesso06597"}' 2>&1`
    );

    // Teste 3: login via nginx interno (como o frontend faz)
    console.log('\n=== Teste 3: curl via nginx interno ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T nginx curl -s -X POST http://apiscale.laboratoriosobral.com.br/api/usuarios/auth/login/?env=prod -H "Content-Type: application/json" -d '{"username":"admin","password":"@cesso06597"}' 2>&1`
    );

    // Teste 4: verificar usuários existentes nos dois bancos
    console.log('\n=== Teste 4: admins em scale e scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "SELECT id, username, is_active, is_superuser, LEFT(password,15) as hash FROM auth_user;" 2>&1`
    );
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "SELECT id, username, is_active, is_superuser, LEFT(password,15) as hash FROM auth_user WHERE username='admin';" 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
