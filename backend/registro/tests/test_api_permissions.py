"""
Suíte de integração: Matriz de permissões RBAC e controles de API.

IDs T-001 a T-054.
Execução:
    python manage.py test registro.tests.test_api_permissions
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from registro.models import (
    EstruturaProduto, ItemEstrutura, ItemOP, OrdemProducao,
    Pesagem, Produto, MateriaPrima, StatusOP, UnidadeMedida,
    TOLERANCIA_PERCENTUAL, KG_TO_G,
)
from usuarios.models import PerfilUsuario

User = get_user_model()
D = Decimal


def _make_user(username, papel):
    user = User.objects.create_user(username, password='senha_teste_123')
    user.perfil.papel = papel
    user.perfil.save()
    return user


class BaseAPISetup(APITestCase):
    """Fixture: usuários com diferentes papéis + dados mínimos de produção."""

    def setUp(self):
        self.operador = _make_user('operador_api', PerfilUsuario.PAPEL_OPERADOR)
        self.supervisor = _make_user('supervisor_api', PerfilUsuario.PAPEL_SUPERVISOR)
        self.admin = _make_user('admin_api', PerfilUsuario.PAPEL_ADMIN)

        self.produto = Produto.objects.create(nome='Produto API', codigo_interno='API-001')
        self.mp = MateriaPrima.objects.create(nome='MP API', codigo_interno='MPAPI-001')
        self.estr = EstruturaProduto.objects.create(produto=self.produto, descricao='v1')
        ItemEstrutura.objects.create(
            estrutura=self.estr, materia_prima=self.mp,
            quantidade_por_lote=D('1000.000'), unidade=UnidadeMedida.G,
        )
        self.op = OrdemProducao.objects.create(
            numero='OP-API-001', produto=self.produto,
            estrutura=self.estr, lote='LAPI001', status=StatusOP.ABERTA,
        )
        self.op.gerar_itens_a_partir_da_estrutura()
        self.item_op = ItemOP.objects.get(op=self.op, materia_prima=self.mp)

    def _criar_pesagem(self, lote_mp='LOTE-BASE-001', liquido_kg=D('0.050')):
        return Pesagem.objects.create(
            op=self.op, item_op=self.item_op, pesador='setup',
            tara=D('0'), liquido=liquido_kg, lote_mp=lote_mp,
        )


# ─── T-001 a T-004 · Acesso anônimo ───────────────────────────────────────────

class AnonAccessTests(BaseAPISetup):

    def test_T001_get_produtos_sem_auth_retorna_401(self):
        res = self.client.get('/api/registro/produtos/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_T002_post_produtos_sem_auth_retorna_401(self):
        res = self.client.post('/api/registro/produtos/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_T003_get_pesagens_sem_auth_retorna_401(self):
        res = self.client.get('/api/registro/pesagens/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_T004_get_auditoria_sem_auth_retorna_401(self):
        res = self.client.get('/api/registro/auditoria/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── T-010 a T-018 · Operador ──────────────────────────────────────────────────

class OperadorPermissionsTests(BaseAPISetup):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.operador)

    def test_T010_operador_le_produtos_200(self):
        res = self.client.get('/api/registro/produtos/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_T011_operador_nao_cria_produto_403(self):
        res = self.client.post('/api/registro/produtos/', {
            'nome': 'Novo Produto', 'codigo_interno': 'NP-001', 'ativo': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T012_operador_nao_edita_produto_403(self):
        res = self.client.put(f'/api/registro/produtos/{self.produto.pk}/', {
            'nome': 'Produto Editado', 'codigo_interno': 'API-001', 'ativo': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T013_operador_nao_deleta_produto_403(self):
        res = self.client.delete(f'/api/registro/produtos/{self.produto.pk}/', {
            'motivo_exclusao': 'descontinuacao',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T014_operador_cria_pesagem_201(self):
        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.100',
            'lote_mp': 'LOTE-OP-001',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_T015_operador_nao_edita_pesagem_403(self):
        pesagem = self._criar_pesagem('LOTE-EDIT-OP')
        res = self.client.put(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_edicao': 'erro_digitacao',
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.060',
            'lote_mp': 'LOTE-EDIT-OP',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T016_operador_nao_deleta_pesagem_403(self):
        pesagem = self._criar_pesagem('LOTE-DEL-OP')
        res = self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_exclusao': 'duplicidade',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T017_operador_nao_acessa_auditoria_403(self):
        res = self.client.get('/api/registro/auditoria/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T018_operador_le_pesagens_200(self):
        res = self.client.get('/api/registro/pesagens/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# ─── T-020 a T-028 · Supervisor ────────────────────────────────────────────────

class SupervisorPermissionsTests(BaseAPISetup):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.supervisor)

    def test_T020_supervisor_cria_produto_201(self):
        res = self.client.post('/api/registro/produtos/', {
            'nome': 'Produto Supervisor', 'codigo_interno': 'SUP-001', 'ativo': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_T021_supervisor_edita_produto_200(self):
        res = self.client.put(f'/api/registro/produtos/{self.produto.pk}/', {
            'nome': 'Produto Editado SUP', 'codigo_interno': 'API-001', 'ativo': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_T022_supervisor_deleta_produto_sem_motivo_retorna_400(self):
        p = Produto.objects.create(nome='Del Sup 1', codigo_interno='DEL-SUP-001')
        res = self.client.delete(f'/api/registro/produtos/{p.pk}/', format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T023_supervisor_deleta_produto_motivo_invalido_retorna_400(self):
        p = Produto.objects.create(nome='Del Sup 2', codigo_interno='DEL-SUP-002')
        res = self.client.delete(f'/api/registro/produtos/{p.pk}/', {
            'motivo_exclusao': 'motivo_que_jamais_existira',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T024_supervisor_deleta_produto_com_motivo_valido_204(self):
        p = Produto.objects.create(nome='Del Sup 3', codigo_interno='DEL-SUP-003')
        res = self.client.delete(f'/api/registro/produtos/{p.pk}/', {
            'motivo_exclusao': 'descontinuacao',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Produto.objects.filter(pk=p.pk).exists())

    def test_T025_supervisor_cria_pesagem_201(self):
        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.100',
            'lote_mp': 'LOTE-SUP-001',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_T026_supervisor_nao_deleta_pesagem_403(self):
        pesagem = self._criar_pesagem('LOTE-DEL-SUP')
        res = self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_exclusao': 'duplicidade',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T027_supervisor_nao_acessa_auditoria_403(self):
        res = self.client.get('/api/registro/auditoria/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_T028_supervisor_edita_pesagem_com_motivo_valido_200(self):
        pesagem = self._criar_pesagem('LOTE-EDIT-SUP')
        res = self.client.put(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_edicao': 'erro_digitacao',
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.060',
            'lote_mp': 'LOTE-EDIT-SUP',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# ─── T-030 a T-037 · Admin ─────────────────────────────────────────────────────

class AdminPermissionsTests(BaseAPISetup):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin)

    def test_T030_admin_acessa_auditoria_200(self):
        res = self.client.get('/api/registro/auditoria/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_T031_admin_cria_produto_201(self):
        res = self.client.post('/api/registro/produtos/', {
            'nome': 'Produto Admin', 'codigo_interno': 'ADM-001', 'ativo': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_T032_admin_deleta_produto_sem_op_204(self):
        p = Produto.objects.create(nome='Del ADM', codigo_interno='DEL-ADM-001')
        res = self.client.delete(f'/api/registro/produtos/{p.pk}/', {
            'motivo_exclusao': 'descontinuacao',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Produto.objects.filter(pk=p.pk).exists())

    def test_T033_admin_nao_deleta_produto_com_op_vinculada_409(self):
        res = self.client.delete(f'/api/registro/produtos/{self.produto.pk}/', {
            'motivo_exclusao': 'descontinuacao',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)

    def test_T034_admin_deleta_pesagem_sem_motivo_retorna_400(self):
        pesagem = self._criar_pesagem('LOTE-DEL-ADM-001')
        res = self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T035_admin_deleta_pesagem_motivo_invalido_retorna_400(self):
        pesagem = self._criar_pesagem('LOTE-DEL-ADM-002')
        res = self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_exclusao': 'motivo_invalido_xyz',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T036_admin_deleta_pesagem_motivo_valido_204(self):
        pesagem = self._criar_pesagem('LOTE-DEL-ADM-003')
        res = self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_exclusao': 'duplicidade',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Pesagem.objects.filter(pk=pesagem.pk).exists())

    def test_T037_admin_deleta_pesagem_reverte_quantidade_pesada(self):
        pesagem = self._criar_pesagem('LOTE-DEL-ADM-004', liquido_kg=D('0.100'))
        self.item_op.refresh_from_db()
        pesada_antes = self.item_op.quantidade_pesada

        self.client.delete(f'/api/registro/pesagens/{pesagem.pk}/', {
            'motivo_exclusao': 'duplicidade',
        }, format='json')

        self.item_op.refresh_from_db()
        self.assertEqual(self.item_op.quantidade_pesada, pesada_antes - D('100.000'))


# ─── T-040 a T-043 · Motivo de edição de Pesagem ───────────────────────────────

class PesagemUpdateReasonTests(BaseAPISetup):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.supervisor)
        self.pesagem = self._criar_pesagem('LOTE-EDIT-REASON')

    def test_T040_put_pesagem_sem_motivo_retorna_400(self):
        res = self.client.put(f'/api/registro/pesagens/{self.pesagem.pk}/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.060',
            'lote_mp': 'LOTE-EDIT-REASON',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('motivo', res.data.get('detail', '').lower())

    def test_T041_put_pesagem_motivo_invalido_retorna_400(self):
        res = self.client.put(f'/api/registro/pesagens/{self.pesagem.pk}/', {
            'motivo_edicao': 'motivo_inexistente_abc',
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.060',
            'lote_mp': 'LOTE-EDIT-REASON',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T042_put_pesagem_motivo_valido_retorna_200(self):
        res = self.client.put(f'/api/registro/pesagens/{self.pesagem.pk}/', {
            'motivo_edicao': 'erro_digitacao',
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.060',
            'lote_mp': 'LOTE-EDIT-REASON',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_T043_patch_pesagem_sem_motivo_retorna_400(self):
        res = self.client.patch(f'/api/registro/pesagens/{self.pesagem.pk}/', {
            'liquido': '0.060',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── T-050 a T-054 · Edge cases de validação na API ───────────────────────────

class PesagemEdgeCaseAPITests(BaseAPISetup):

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.operador)

    def test_T050_pesagem_rejeita_liquido_zero_400(self):
        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.000',
            'lote_mp': 'LOTE-ZERO',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T051_pesagem_rejeita_tara_negativa_400(self):
        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '-0.001',
            'liquido': '0.100',
            'lote_mp': 'LOTE-TARA-NEG',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T052_pesagem_rejeita_lote_mp_vazio_400(self):
        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': '0.100',
            'lote_mp': '',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T053_pesagem_rejeita_item_op_de_outra_op_400(self):
        op2 = OrdemProducao.objects.create(
            numero='OP-API-002', produto=self.produto,
            estrutura=self.estr, lote='LAPI002',
        )
        op2.gerar_itens_a_partir_da_estrutura()
        item_op2 = ItemOP.objects.get(op=op2, materia_prima=self.mp)

        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': item_op2.pk,
            'tara': '0.000',
            'liquido': '0.100',
            'lote_mp': 'LOTE-CROSS-OP',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_T054_pesagem_rejeita_excesso_de_tolerancia_400(self):
        limite_superior_g = D('1000') * (D('1') + TOLERANCIA_PERCENTUAL)
        acima_g = limite_superior_g + D('1')

        res = self.client.post('/api/registro/pesagens/', {
            'op_id': self.op.pk,
            'item_op_id': self.item_op.pk,
            'tara': '0.000',
            'liquido': str(acima_g / KG_TO_G),
            'lote_mp': 'LOTE-TETO',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
