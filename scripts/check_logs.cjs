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
    // Testar login via python dentro do container
    console.log('\n=== Teste HTTP via python no backend container ===');
    const pyHttp = [
      'import urllib.request, json',
      'body = json.dumps({"username":"admin","password":"@cesso06597"}).encode()',
      'req = urllib.request.Request("http://localhost:8000/api/usuarios/auth/login/?env=prod", data=body, headers={"Content-Type":"application/json"}, method="POST")',
      'try:',
      '  resp = urllib.request.urlopen(req)',
      '  print("STATUS:", resp.status)',
      '  print("BODY:", resp.read().decode()[:200])',
      'except urllib.error.HTTPError as e:',
      '  print("HTTP ERROR:", e.code)',
      '  print("BODY:", e.read().decode()[:300])',
      'except Exception as ex:',
      '  print("ERRO:", ex)',
    ].join('\n');

    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python -c "${pyHttp.replace(/\n/g, '; ').replace(/"/g, '\\"')}" 2>&1`
    );

    // Últimas linhas do log do gunicorn
    console.log('\n=== Últimos logs do backend ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose logs --tail=30 backend 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
