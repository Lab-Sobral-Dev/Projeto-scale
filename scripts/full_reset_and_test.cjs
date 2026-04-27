const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';
const NEW_PASS = process.env.NEW_PASS || 'Scale2026';

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

// Escreve um arquivo Python no container e o executa
function runPyFile(conn, scriptContent, label) {
  return new Promise((resolve, reject) => {
    const tmpPath = `/tmp/scale_test_${Date.now()}.py`;
    // Escreve o arquivo via heredoc
    const writeCmd = `cat > ${tmpPath} << 'PYEOF'\n${scriptContent}\nPYEOF`;
    const execCmd = `cd ${PROJECT_DIR} && docker compose exec -T backend bash -c "cat > ${tmpPath} << 'PYEOF'\n${scriptContent}\nPYEOF\n && python ${tmpPath}"`;

    console.log(`\n=== ${label} ===`);
    conn.exec(execCmd, (err, stream) => {
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
    const newPass = NEW_PASS;

    // Passo 1: Resetar senha em ambos os bancos via manage.py shell (linha única, sem try/except)
    console.log('\n=== 1. Redefinir senha admin em scale (prod) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.using('default').filter(username='admin').delete(); u = User.objects.db_manager('default').create_superuser(username='admin', email='suporte@laboratoriosobral.com.br', password='${newPass}'); print('PROD admin id:', u.id)" 2>&1`
    );

    console.log('\n=== 2. Redefinir senha admin em scale_hml (hml) ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.using('hml').filter(username='admin').delete(); u = User.objects.db_manager('hml').create_superuser(username='admin', email='suporte@laboratoriosobral.com.br', password='${newPass}'); print('HML admin id:', u.id)" 2>&1`
    );

    // Passo 2: Limpar throttle cache (se Redis/memcache)
    console.log('\n=== 3. Limpar LoginSecurity e falhas em ambos os bancos ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "DELETE FROM usuarios_loginsecurity;" 2>&1`
    );
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "DELETE FROM usuarios_loginsecurity;" 2>&1`
    );

    // Passo 3: Testar HTTP direto no backend
    console.log('\n=== 4. Testar login HTTP via python no container ===');
    const pyTest = `
import urllib.request, json, sys
tests = [
    ('prod', 'http://localhost:8000/api/usuarios/auth/login/?env=prod'),
    ('hml',  'http://localhost:8000/api/usuarios/auth/login/?env=hml'),
]
for env, url in tests:
    body = json.dumps({'username': 'admin', 'password': '${newPass}'}).encode()
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        print(f'[{env}] STATUS 200 - access token: {data.get(\"access\", \"\")[:30]}...')
    except urllib.error.HTTPError as e:
        body_str = e.read().decode()
        print(f'[{env}] HTTP {e.code}: {body_str[:200]}')
    except Exception as ex:
        print(f'[{env}] ERRO: {ex}')
`;

    // Escreve o script como arquivo dentro do container e executa
    const tmpFile = `/tmp/test_login_${Date.now()}.py`;
    // Usa printf para evitar problemas com heredoc via SSH
    const escapedScript = pyTest.replace(/'/g, "'\\''").replace(/\n/g, '\\n');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T backend bash -c "printf '${escapedScript}' > ${tmpFile} && python ${tmpFile}" 2>&1`
    );

    console.log('\n=== 5. Logs recentes do backend ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose logs --tail=10 backend 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
