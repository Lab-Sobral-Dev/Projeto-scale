"""
Completude do PDF dos relatórios de auditoria.

Origem: incidente de 2026-09-04. Ao pedir o relatório "Auditoria — Logs do
Sistema" de 17/08/2026 a 31/08/2026, o PDF vinha só de 27/08 a 31/08. O
intervalo tinha 11.714 registros em produção, mas o ramo `export == "pdf"`
fatiava `qs[:2000]` sobre um queryset ordenado por `-timestamp`: sobravam os
2.000 eventos mais recentes e 9.714 (83%) eram descartados **sem nenhum aviso
no documento**. Um relatório de auditoria incompleto e silencioso é pior que
um erro, porque quem assina não tem como perceber.

O teto existia para caber no orçamento de tempo da requisição. Medido na VPS
em 2026-09-04, o gerador faz as 11.714 linhas em ~30s — dentro dos 60s do
nginx e dos 120s do gunicorn. Não havia motivo para o corte em 2.000.

A regra passa a ser: o PDF traz o intervalo inteiro e declara no rodapé
quantos registros contém. Volume que não caiba no orçamento de tempo é
recusado explicitamente, nunca truncado.
"""
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from registro.audit_models import AuditLog
from usuarios.models import PerfilUsuario

User = get_user_model()

TZ = ZoneInfo("America/Fortaleza")

# Rotas dos três relatórios de auditoria que exportam PDF.
ROTA_LOGS = "/api/reports/auditoria/logs-sistema/"
ROTA_ACOES = "/api/reports/auditoria/acoes/"
ROTA_AUTH = "/api/reports/auditoria/auth-erros/"


@override_settings(AUDIT_ENABLED=False)
class BasePdfAuditoria(APITestCase):
    """Fixture: um admin autenticado e registros espalhados no intervalo."""

    def setUp(self):
        self.admin = User.objects.create_user("admin_pdf", password="senha_teste_123")
        self.admin.perfil.papel = PerfilUsuario.PAPEL_ADMIN
        self.admin.perfil.save()
        self.client.force_authenticate(user=self.admin)

    def _criar_logs(self, quantidade, primeiro_dia="2026-08-17", action="request"):
        """Distribui `quantidade` registros a partir de `primeiro_dia`, 1h entre cada.

        Espalhar no tempo é essencial: o bug só aparece porque o corte era feito
        sobre a ordenação por timestamp, então registros antigos eram os
        descartados.
        """
        base = datetime.fromisoformat(f"{primeiro_dia}T00:00:00").replace(tzinfo=TZ)
        AuditLog.objects.bulk_create([
            AuditLog(
                timestamp=base + timedelta(hours=i),
                path=f"/api/registro/pesagens/{i}/",
                method="GET",
                status_code=200,
                action=action,
                model="Pesagem",
                object_pk=str(i),
            )
            for i in range(quantidade)
        ])

    def _linhas_do_pdf(self, rota, **params):
        """Executa o export=pdf e devolve as linhas entregues ao gerador.

        Interceptar `export_pdf` é o que permite contar as linhas sem depender
        de parsear o PDF, e prova que a view repassa o intervalo inteiro.
        """
        with patch("reports.views.auditoria.export_pdf") as mock_pdf:
            # Precisa ser um HttpResponse real: a view devolve o que export_pdf
            # retorna, e o DRF rejeita qualquer outra coisa.
            mock_pdf.return_value = HttpResponse(b"%PDF-fake", content_type="application/pdf")
            res = self.client.get(rota, {"export": "pdf", **params})
        return res, mock_pdf


class PdfCompletudeTests(BasePdfAuditoria):

    def test_pdf_traz_todos_os_registros_do_intervalo(self):
        """O incidente: 2.100 registros no intervalo, PDF entregava 2.000."""
        self._criar_logs(2100)

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        self.assertTrue(mock_pdf.called, "export_pdf não foi chamado")
        rows = mock_pdf.call_args.kwargs.get("rows") or mock_pdf.call_args.args[3]
        self.assertEqual(len(rows), 2100)

    def test_pdf_preserva_o_registro_mais_antigo_do_intervalo(self):
        """O que o operador percebeu: o começo do período desaparecia.

        Afirma sobre a data mais antiga presente, que é a consequência visível,
        e não sobre a contagem — um PDF com 2.100 linhas erradas passaria no
        teste anterior mas falharia aqui.
        """
        self._criar_logs(2100)

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        rows = mock_pdf.call_args.kwargs.get("rows") or mock_pdf.call_args.args[3]
        datas = {linha[1][:10] for linha in rows}  # coluna "Data e hora (GMT-3)"
        self.assertIn("2026-08-17", datas)

    def test_pdf_de_acoes_tambem_traz_o_intervalo_inteiro(self):
        """O mesmo corte existia nos outros dois relatórios de auditoria."""
        self._criar_logs(2100, action="create")

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_ACOES, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        rows = mock_pdf.call_args.kwargs.get("rows") or mock_pdf.call_args.args[3]
        self.assertEqual(len(rows), 2100)

    def test_pdf_de_login_tambem_traz_o_intervalo_inteiro(self):
        self._criar_logs(2100, action="login")

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_AUTH, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        rows = mock_pdf.call_args.kwargs.get("rows") or mock_pdf.call_args.args[3]
        self.assertEqual(len(rows), 2100)


class PdfGuardaDeVolumeTests(BasePdfAuditoria):
    """Substitui o truncamento silencioso por recusa explícita."""

    @patch("reports.views.auditoria.PDF_MAX_ROWS", 10)
    def test_volume_acima_do_teto_e_recusado_sem_gerar_pdf(self):
        self._criar_logs(11)

        res, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            mock_pdf.called,
            "PDF não deve ser gerado quando o volume excede o teto",
        )

    @patch("reports.views.auditoria.PDF_MAX_ROWS", 10)
    def test_recusa_informa_o_total_e_o_teto(self):
        """A mensagem tem que dizer o tamanho do problema, não só que falhou."""
        self._criar_logs(11)

        res, _ = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        detalhe = str(res.data)
        self.assertIn("11", detalhe)
        self.assertIn("10", detalhe)

    @patch("reports.views.auditoria.PDF_MAX_ROWS", 10)
    def test_volume_dentro_do_teto_gera_normalmente(self):
        """Guarda: a recusa não pode disparar no limite exato."""
        self._criar_logs(10)

        res, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(mock_pdf.called)

    @patch("reports.views.auditoria.PDF_MAX_ROWS", 10)
    def test_csv_nao_e_limitado_pelo_teto_do_pdf(self):
        """O CSV faz streaming e é a saída para volume grande — não pode regredir."""
        self._criar_logs(11)

        res = self.client.get(
            ROTA_LOGS,
            {"export": "csv", "data_inicial": "2026-08-17", "data_final": "2026-12-31"},
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)


class PdfRodapeTests(BasePdfAuditoria):
    """O PDF precisa declarar a própria completude."""

    def test_rodape_declara_o_total_de_registros(self):
        self._criar_logs(30)

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-12-31"
        )

        rodape = mock_pdf.call_args.kwargs.get("footer") or ""
        self.assertIn("30", rodape)


class PdfFiltroDeDataTests(BasePdfAuditoria):
    """Guarda: remover o teto não pode afrouxar o filtro de data."""

    def test_pdf_ignora_registros_fora_do_intervalo(self):
        self._criar_logs(5, primeiro_dia="2026-08-17")
        self._criar_logs(7, primeiro_dia="2026-10-01")

        _, mock_pdf = self._linhas_do_pdf(
            ROTA_LOGS, data_inicial="2026-08-17", data_final="2026-08-18"
        )

        rows = mock_pdf.call_args.kwargs.get("rows") or mock_pdf.call_args.args[3]
        self.assertEqual(len(rows), 5)
