const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function runPy(conn, label, script) {
  const b64 = Buffer.from(script).toString('base64');
  const cmd = `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "import base64,sys; exec(base64.b64decode('${b64}').decode())" 2>&1`;
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve());
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
    // Passo 1: Diagnosticar estado atual do HML
    await runPy(conn, '1. Estado atual do banco HML', `
from django.conf import settings
from usuarios.models import Screen, Role, PerfilUsuario
from django.contrib.auth import get_user_model
User = get_user_model()

print("=== Banco HML (scale_hml) ===")
print("Screens:", Screen.objects.using('hml').count())
print("Roles:", Role.objects.using('hml').count())
print("PerfilUsuario:", PerfilUsuario.objects.using('hml').count())
try:
    u = User.objects.using('hml').get(username='admin')
    print("Admin user_id:", u.id, "is_superuser:", u.is_superuser)
    perfil = PerfilUsuario.objects.using('hml').filter(user=u).first()
    if perfil:
        print("Admin papel:", perfil.papel)
        print("Admin screens:", perfil.get_allowed_screens())
    else:
        print("Admin: SEM PerfilUsuario")
except Exception as e:
    print("Erro ao buscar admin:", e)
`);

    // Passo 2: Popular Screens, Roles e corrigir PerfilUsuario do admin no HML
    await runPy(conn, '2. Popular Screens, Roles e corrigir admin no HML', `
from django.conf import settings
from usuarios.models import Screen, Role, PerfilUsuario
from django.contrib.auth import get_user_model
from django.db import transaction
from registro.db_context import set_db

User = get_user_model()

set_db('hml')

try:
    with transaction.atomic(using='hml'):
        for code, label in settings.SCREENS_REGISTRY:
            s, c = Screen.objects.using('hml').get_or_create(code=code, defaults={'label': label})
            print('Screen:', code, '(nova)' if c else '(ok)')

        admin_role, _ = Role.objects.using('hml').get_or_create(name='admin')
        all_screens = list(Screen.objects.using('hml').filter(code__in=[c for c,l in settings.SCREENS_REGISTRY]))
        admin_role.screens.set(all_screens)
        print('Role admin:', len(all_screens), 'telas')

        for role_name, codes in settings.ROLE_DEFAULT_SCREENS.items():
            role, _ = Role.objects.using('hml').get_or_create(name=role_name)
            screens = list(Screen.objects.using('hml').filter(code__in=codes))
            role.screens.set(screens)
            print(f'Role {role_name}: {len(screens)} telas')

        u = User.objects.using('hml').get(username='admin')
        perfil, created = PerfilUsuario.objects.using('hml').get_or_create(
            user=u, defaults={'papel': PerfilUsuario.PAPEL_ADMIN}
        )
        if not created and perfil.papel != PerfilUsuario.PAPEL_ADMIN:
            perfil.papel = PerfilUsuario.PAPEL_ADMIN
            perfil.save(using='hml')
        perfil.sync_roles_with_papel()

        print('Admin papel:', perfil.papel)
        print('Admin roles:', list(perfil.roles.using('hml').values_list('name', flat=True)))
        print('Admin screens:', perfil.get_allowed_screens())
finally:
    set_db('default')
`);

    // Passo 3: Verificar estado final no banco HML
    console.log('\n=== 3. Estado final no scale_hml ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale_hml -c "
SELECT 'screens' as tabela, COUNT(*) FROM usuarios_screen
UNION ALL SELECT 'roles', COUNT(*) FROM usuarios_role
UNION ALL SELECT 'perfilusuario', COUNT(*) FROM usuarios_perfilusuario
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user;" 2>&1`
    );

    // Passo 4: Teste de login HML para confirmar JWT com allowed_screens
    console.log('\n=== 4. Teste login HML (verificar JWT) ===');
    await run(conn, `cat > /tmp/test_hml.sh << 'HEREDOC'
#!/bin/sh
curl -k -s -X POST "https://apiscale.laboratoriosobral.com.br/api/usuarios/auth/login/?env=hml" \\
  -H "Content-Type: application/json" \\
  -H "Origin: https://scale.laboratoriosobral.com.br" \\
  --data-raw '{"username":"admin","password":"Scale2026"}' 2>&1
HEREDOC
chmod +x /tmp/test_hml.sh && /tmp/test_hml.sh`);

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
