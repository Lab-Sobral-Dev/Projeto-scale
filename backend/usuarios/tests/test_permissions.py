"""
Suíte unitária: Classes de permissão de usuarios/permissions.py

Execução: python manage.py test usuarios.tests.test_permissions
"""
from unittest.mock import MagicMock

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from usuarios.models import PerfilUsuario
from usuarios.permissions import (
    IsAdmin,
    IsAdminOrReadOnly,
    IsOperatorCreateOrSupervisorEdit,
    IsSupervisorOrAdmin,
    IsSupervisorOrAdminOrReadOnly,
)

P = PerfilUsuario


def _mock_user(papel=None, authenticated=True):
    user = MagicMock()
    user.is_authenticated = authenticated
    if papel:
        perfil = MagicMock()
        perfil.papel = papel
        perfil.PAPEL_OPERADOR = P.PAPEL_OPERADOR
        perfil.PAPEL_SUPERVISOR = P.PAPEL_SUPERVISOR
        perfil.PAPEL_ADMIN = P.PAPEL_ADMIN
        user.perfil = perfil
    else:
        user.perfil = None
    return user


class IsAdminTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.perm = IsAdmin()

    def test_nega_anonimo(self):
        req = self.factory.get('/')
        req.user = _mock_user(authenticated=False)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_nega_sem_perfil(self):
        req = self.factory.get('/')
        req.user = _mock_user(authenticated=True, papel=None)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_nega_operador(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_nega_supervisor(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_permite_admin(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_ADMIN)
        self.assertTrue(self.perm.has_permission(req, None))


class IsSupervisorOrAdminTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.perm = IsSupervisorOrAdmin()

    def test_nega_anonimo(self):
        req = self.factory.get('/')
        req.user = _mock_user(authenticated=False)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_nega_operador(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_permite_supervisor(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_permite_admin(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_ADMIN)
        self.assertTrue(self.perm.has_permission(req, None))


class IsAdminOrReadOnlyTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.perm = IsAdminOrReadOnly()

    def test_get_permite_operador(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_get_permite_supervisor(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_post_nega_operador(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_post_nega_supervisor(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_post_permite_admin(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_ADMIN)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_delete_nega_anonimo(self):
        req = self.factory.delete('/')
        req.user = _mock_user(authenticated=False)
        self.assertFalse(self.perm.has_permission(req, None))


class IsSupervisorOrAdminOrReadOnlyTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.perm = IsSupervisorOrAdminOrReadOnly()

    def test_get_permite_operador(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_post_nega_operador(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_post_permite_supervisor(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_post_permite_admin(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_ADMIN)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_get_nega_anonimo(self):
        req = self.factory.get('/')
        req.user = _mock_user(authenticated=False)
        self.assertFalse(self.perm.has_permission(req, None))


class IsOperatorCreateOrSupervisorEditTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.perm = IsOperatorCreateOrSupervisorEdit()

    def test_get_permite_operador(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_get_permite_supervisor(self):
        req = self.factory.get('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_post_permite_operador(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_post_permite_supervisor(self):
        req = self.factory.post('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_put_nega_operador(self):
        req = self.factory.put('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_put_permite_supervisor(self):
        req = self.factory.put('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_put_permite_admin(self):
        req = self.factory.put('/')
        req.user = _mock_user(P.PAPEL_ADMIN)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_delete_nega_operador(self):
        req = self.factory.delete('/')
        req.user = _mock_user(P.PAPEL_OPERADOR)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_delete_permite_supervisor(self):
        req = self.factory.delete('/')
        req.user = _mock_user(P.PAPEL_SUPERVISOR)
        self.assertTrue(self.perm.has_permission(req, None))

    def test_nega_nao_autenticado(self):
        req = self.factory.get('/')
        req.user = _mock_user(authenticated=False)
        self.assertFalse(self.perm.has_permission(req, None))

    def test_nega_sem_perfil_em_escrita(self):
        req = self.factory.put('/')
        req.user = _mock_user(authenticated=True, papel=None)
        self.assertFalse(self.perm.has_permission(req, None))
