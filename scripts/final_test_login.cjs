const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;

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
    // Write a test script to the server to avoid quote escaping
    const curlScript = `#!/bin/sh
echo "=== Login prod ==="
curl -k -s -w "\\nHTTP: %{http_code}\\n" \\
  -X POST "https://apiscale.laboratoriosobral.com.br/api/usuarios/auth/login/?env=prod" \\
  -H "Content-Type: application/json" \\
  -H "Origin: https://scale.laboratoriosobral.com.br" \\
  --data-raw '{"username":"admin","password":"Scale2026"}' 2>&1
echo ""
echo "=== Login hml ==="
curl -k -s -w "\\nHTTP: %{http_code}\\n" \\
  -X POST "https://apiscale.laboratoriosobral.com.br/api/usuarios/auth/login/?env=hml" \\
  -H "Content-Type: application/json" \\
  -H "Origin: https://scale.laboratoriosobral.com.br" \\
  --data-raw '{"username":"admin","password":"Scale2026"}' 2>&1
`;

    await run(conn, `cat > /tmp/test_login.sh << 'HEREDOC'\n${curlScript}\nHEREDOC`);
    await run(conn, 'chmod +x /tmp/test_login.sh && /tmp/test_login.sh');

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
