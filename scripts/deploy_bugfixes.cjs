const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';
const LOCAL_BASE = 'D:/Hclaudio/Documents/Projetos/scale';

const FILES = [
  'backend/usuarios/views_security.py',
  'backend/usuarios/views_auth.py',
  'backend/usuarios/signals.py',
];

function writeFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', () => { sftp.end(); resolve(); });
      stream.on('error', reject);
      stream.write(content);
      stream.end();
    });
  });
}

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.substring(0, 100)}`);
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
    for (const relPath of FILES) {
      const localPath = path.join(LOCAL_BASE, relPath).replace(/\//g, path.sep);
      const remotePath = `${PROJECT_DIR}/${relPath}`;
      const content = fs.readFileSync(localPath);
      console.log(`\nUploading ${relPath}...`);
      await writeFile(conn, remotePath, content);
      console.log(`  OK`);
    }

    console.log('\n=== Reiniciando backend ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose restart backend 2>&1`);

    console.log('\n=== Aguardando inicialização ===');
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n=== Django check ===');
    await run(conn, `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py check 2>&1 | tail -3`);

    console.log('\n=== Teste: force_reset retorna temporary_password? ===');
    // Busca um usuário não-admin para testar
    await run(conn, `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "from django.contrib.auth import get_user_model; U=get_user_model(); users=list(U.objects.exclude(username='admin').values('id','username')[:3]); print(users)" 2>&1`);

  } catch (e) {
    console.error('\nErro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
