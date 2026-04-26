"""
Suíte unitária: PerfilUsuario — criação automática, sincronização de roles e has_screen.

Execução: python manage.py test usuarios.tests.test_perfil
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from usuarios.models import PerfilUsuario, Role, Screen

User = get_user_model()


class PerfilCriadoAutomaticamenteTests(TestCase):

    def test_novo_usuario_tem_perfil_com_papel_operador(self):
        user = User.objects.create_user('novo_user', password='pass')
        self.assertTrue(hasattr(user, 'perfil'))
        self.assertEqual(user.perfil.papel, PerfilUsuario.PAPEL_OPERADOR)

    def test_perfil_nao_duplicado_ao_ressalvar_usuario(self):
        user = User.objects.create_user('user_resave', password='pass')
        user.first_name = 'Atualizado'
        user.save()
        self.assertEqual(PerfilUsuario.objects.filter(user=user).count(), 1)

    def test_perfil_pode_ter_papel_alterado(self):
        user = User.objects.create_user('user_papel', password='pass')
        user.perfil.papel = PerfilUsuario.PAPEL_SUPERVISOR
        user.perfil.save()
        user.perfil.refresh_from_db()
        self.assertEqual(user.perfil.papel, PerfilUsuario.PAPEL_SUPERVISOR)


class SyncRolesTests(TestCase):

    def setUp(self):
        self.role_operador, _ = Role.objects.get_or_create(name=PerfilUsuario.PAPEL_OPERADOR)
        self.role_supervisor, _ = Role.objects.get_or_create(name=PerfilUsuario.PAPEL_SUPERVISOR)
        self.role_admin, _ = Role.objects.get_or_create(name=PerfilUsuario.PAPEL_ADMIN)

    def test_novo_usuario_sincroniza_role_operador(self):
        user = User.objects.create_user('sync_novo', password='pass')
        self.assertTrue(user.perfil.roles.filter(name=PerfilUsuario.PAPEL_OPERADOR).exists())

    def test_mudanca_para_supervisor_remove_role_operador(self):
        user = User.objects.create_user('sync_sup', password='pass')
        perfil = user.perfil
        perfil.papel = PerfilUsuario.PAPEL_SUPERVISOR
        perfil.save()

        self.assertFalse(perfil.roles.filter(name=PerfilUsuario.PAPEL_OPERADOR).exists())
        self.assertTrue(perfil.roles.filter(name=PerfilUsuario.PAPEL_SUPERVISOR).exists())

    def test_mudanca_para_admin_garante_role_admin(self):
        user = User.objects.create_user('sync_adm', password='pass')
        perfil = user.perfil
        perfil.papel = PerfilUsuario.PAPEL_ADMIN
        perfil.save()

        self.assertTrue(perfil.roles.filter(name=PerfilUsuario.PAPEL_ADMIN).exists())
        self.assertFalse(perfil.roles.filter(name=PerfilUsuario.PAPEL_OPERADOR).exists())

    def test_sync_sem_role_seed_nao_falha(self):
        """Se os Roles ainda não foram criados pelo seed, sync não deve lançar erro."""
        self.role_operador.delete()
        self.role_supervisor.delete()
        self.role_admin.delete()

        try:
            user = User.objects.create_user('sync_semrole', password='pass')
            user.perfil.papel = PerfilUsuario.PAPEL_ADMIN
            user.perfil.save()
        except Exception as exc:
            self.fail(f"sync_roles_with_papel lançou exceção inesperada: {exc}")


class HasScreenTests(TestCase):

    def setUp(self):
        self.screen_cad, _ = Screen.objects.get_or_create(code='test-cadastros', defaults={'label': 'Cadastros Teste'})
        self.screen_rel, _ = Screen.objects.get_or_create(code='test-relatorios', defaults={'label': 'Relatórios Teste'})
        self.role, _ = Role.objects.get_or_create(name='role_teste_unico')
        self.role.screens.add(self.screen_cad)

    def test_has_screen_true_via_role(self):
        user = User.objects.create_user('screen_via_role', password='pass')
        perfil = user.perfil
        perfil.roles.add(self.role)
        self.assertTrue(perfil.has_screen('test-cadastros'))

    def test_has_screen_false_sem_role(self):
        user = User.objects.create_user('screen_semrole', password='pass')
        perfil = user.perfil
        self.assertFalse(perfil.has_screen('test-cadastros'))

    def test_has_screen_false_tela_inexistente(self):
        user = User.objects.create_user('screen_inexist', password='pass')
        perfil = user.perfil
        perfil.roles.add(self.role)
        self.assertFalse(perfil.has_screen('tela_que_jamais_existira'))

    def test_has_screen_true_via_extra_screens(self):
        user = User.objects.create_user('screen_extra', password='pass')
        perfil = user.perfil
        perfil.extra_screens.add(self.screen_rel)
        self.assertTrue(perfil.has_screen('test-relatorios'))

    def test_extra_screens_acumulam_com_roles(self):
        user = User.objects.create_user('screen_acum', password='pass')
        perfil = user.perfil
        perfil.roles.add(self.role)
        perfil.extra_screens.add(self.screen_rel)
        screens = perfil.get_allowed_screens()
        self.assertIn('test-cadastros', screens)
        self.assertIn('test-relatorios', screens)

    def test_get_allowed_screens_retorna_lista_ordenada(self):
        user = User.objects.create_user('screen_sort', password='pass')
        perfil = user.perfil
        perfil.roles.add(self.role)
        perfil.extra_screens.add(self.screen_rel)
        screens = perfil.get_allowed_screens()
        self.assertEqual(screens, sorted(screens))
