const { Client } = require('C:/Users/hclaudio/AppData/Local/Temp/sshtmp/node_modules/ssh2');

const HOST = '191.101.18.82';
const USER = 'suporte';
const PASS = process.env.SSH_PASS;
const PROJECT_DIR = '/home/suporte/projetos/Projeto-scale';

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.substring(0, 120)}...`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve());
    });
  });
}

// Executa script Python multi-linha via manage.py shell + base64
function runPy(conn, label, script) {
  const b64 = Buffer.from(script).toString('base64');
  const cmd = `cd ${PROJECT_DIR} && docker compose exec -T backend python manage.py shell -c "import base64,sys; exec(base64.b64decode('${b64}').decode())" 2>&1`;
  console.log(`\n=== ${label} ===`);
  return run(conn, cmd);
}

const conn = new Client();

conn.on('ready', async () => {
  try {

    // Passo 1: Popular Screens e Roles + corrigir PerfilUsuario do admin
    await runPy(conn, '1. Popular Screens, Roles e corrigir admin', `
from django.conf import settings
from usuarios.models import Screen, Role, PerfilUsuario
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()

with transaction.atomic(using='default'):
    # Criar telas
    for code, label in settings.SCREENS_REGISTRY:
        s, c = Screen.objects.using('default').get_or_create(code=code, defaults={'label': label})
        print('Screen:', code, '(nova)' if c else '(ok)')

    # Role admin com todas as telas
    admin_role, _ = Role.objects.using('default').get_or_create(name='admin')
    all_screens = list(Screen.objects.using('default').all())
    admin_role.screens.set(all_screens)
    print('Role admin:', len(all_screens), 'telas')

    # Roles supervisor e operador
    for role_name, codes in settings.ROLE_DEFAULT_SCREENS.items():
        role, _ = Role.objects.using('default').get_or_create(name=role_name)
        screens = list(Screen.objects.using('default').filter(code__in=codes))
        role.screens.set(screens)
        print(f'Role {role_name}:', len(screens), 'telas')

    # Corrigir PerfilUsuario do admin
    u = User.objects.using('default').get(username='admin')
    perfil, created = PerfilUsuario.objects.using('default').get_or_create(
        user=u, defaults={'papel': PerfilUsuario.PAPEL_ADMIN}
    )
    if not created and perfil.papel != PerfilUsuario.PAPEL_ADMIN:
        perfil.papel = PerfilUsuario.PAPEL_ADMIN
        perfil.save(using='default')
    perfil.sync_roles_with_papel()

    print('Admin perfil:', perfil.papel)
    print('Admin roles:', list(perfil.roles.values_list('name', flat=True)))
    print('Admin screens:', perfil.get_allowed_screens())
`);

    // Passo 2: Estado final no banco
    console.log('\n=== 2. Estado final em scale ===');
    await run(conn,
      `cd ${PROJECT_DIR} && docker compose exec -T db psql -U suporte -d scale -c "
SELECT 'screens' as tabela, COUNT(*) FROM usuarios_screen
UNION ALL SELECT 'roles', COUNT(*) FROM usuarios_role
UNION ALL SELECT 'perfilusuario', COUNT(*) FROM usuarios_perfilusuario
UNION ALL SELECT 'auth_user', COUNT(*) FROM auth_user;
" 2>&1`
    );

  } catch (e) {
    console.error('\n❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
