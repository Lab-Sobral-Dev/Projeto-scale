import json
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from reports.views.backups import (
    _clean_user,
    _read_jsonl_restores,
    _parse_restore_log,
    load_restore_history,
    RESTORE_JSONL,
    RESTORE_LOG,
)

# Conteúdo real do restore_history.log legado (2 restaurações: uma sem env, uma hml)
LEGADO = (
    "[2025-12-01 15:19:44] SOLICITAÇÃO DE RESTORE por admin (ID: 1) - IP: 192.168.208.8. "
    "Alvo: /var/backups/scale/db-20251201-142700.sql.gz\n"
    "[2025-12-01 15:19:45] Backup de segurança criado: /var/backups/scale/safety_before_restore_db-20251201-151944.sql.gz\n"
    "[2025-12-01 15:19:46] SUCESSO: Banco restaurado para versão db-20251201-142700.sql.gz.\n"
    "[2026-06-29 10:38:21] SOLICITAÇÃO DE RESTORE (hml) por admin (ID: 10) - IP: 172.27.0.7. "
    "Alvo: /var/backups/scale/db-hml-20260629-103602.sql.gz\n"
    "[2026-06-29 10:38:24] Logs de auditoria exportados para: /var/backups/scale/audit_log_snapshot_20260629-103821.csv\n"
    "[2026-06-29 10:38:29] SUCESSO: Banco restaurado para versão db-hml-20260629-103602.sql.gz.\n"
)


class CleanUserTests(SimpleTestCase):
    def test_remove_ip_suffix(self):
        self.assertEqual(_clean_user("admin (ID: 1) - IP: 192.168.208.8"), "admin (ID: 1)")

    def test_sem_ip(self):
        self.assertEqual(_clean_user("joao"), "joao")

    def test_vazio_vira_traco(self):
        self.assertEqual(_clean_user(""), "—")
        self.assertEqual(_clean_user(None), "—")


class ParseRestoreLogTests(SimpleTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _dir_com_log(self, conteudo):
        d = Path(self.tmp.name)
        (d / RESTORE_LOG).write_text(conteudo, encoding="utf-8")
        return d

    def test_parseia_dois_eventos(self):
        eventos = _parse_restore_log(self._dir_com_log(LEGADO))
        self.assertEqual(len(eventos), 2)

        e1, e2 = eventos[0], eventos[1]
        # primeiro evento (2025, sem env)
        self.assertEqual(e1["timestamp"], "2025-12-01 15:19:44")
        self.assertEqual(e1["usuario"], "admin (ID: 1) - IP: 192.168.208.8")
        self.assertEqual(e1["env"], "")
        self.assertEqual(e1["arquivo"], "db-20251201-142700.sql.gz")
        self.assertEqual(e1["resultado"], "sucesso")
        # segundo evento (2026, hml)
        self.assertEqual(e2["env"], "hml")
        self.assertEqual(e2["arquivo"], "db-hml-20260629-103602.sql.gz")
        self.assertEqual(e2["resultado"], "sucesso")

    def test_erro_marca_resultado(self):
        conteudo = (
            "[2026-01-01 10:00:00] SOLICITAÇÃO DE RESTORE (hml) por joao. Alvo: /x/db-1.sql.gz\n"
            "[2026-01-01 10:00:02] ERRO CRÍTICO DURANTE O RESTORE: psql falhou\n"
        )
        eventos = _parse_restore_log(self._dir_com_log(conteudo))
        self.assertEqual(len(eventos), 1)
        self.assertEqual(eventos[0]["resultado"], "erro")
        self.assertIn("psql falhou", eventos[0]["obs"])

    def test_arquivo_ausente(self):
        self.assertEqual(_parse_restore_log(Path(self.tmp.name)), [])

    def test_linhas_lixo_ignoradas(self):
        eventos = _parse_restore_log(self._dir_com_log("linha qualquer\n[bad] outra\n"))
        self.assertEqual(eventos, [])


class ReadJsonlTests(SimpleTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_le_e_ignora_linha_corrompida(self):
        d = Path(self.tmp.name)
        bom = {"timestamp": "2026-06-30T10:00:00-03:00", "usuario": "ana",
               "env": "hml", "arquivo": "db-x.sql.gz", "resultado": "sucesso", "obs": ""}
        (d / RESTORE_JSONL).write_text(
            json.dumps(bom) + "\n" + "{linha corrompida\n" + "\n", encoding="utf-8"
        )
        recs = _read_jsonl_restores(d)
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0]["usuario"], "ana")
        self.assertEqual(recs[0]["arquivo"], "db-x.sql.gz")

    def test_arquivo_ausente(self):
        self.assertEqual(_read_jsonl_restores(Path(self.tmp.name)), [])


class MergeDedupTests(SimpleTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)

    def test_dedup_prioriza_jsonl_e_inclui_historico(self):
        # jsonl: restauração de db-hml-...602 em 2026-06-29 (gêmeo do log)
        rec = {"timestamp": "2026-06-29T10:38:29-03:00", "usuario": "admin (ID: 10)",
               "env": "hml", "arquivo": "db-hml-20260629-103602.sql.gz",
               "resultado": "sucesso", "obs": "Backup de segurança: x"}
        (self.d / RESTORE_JSONL).write_text(json.dumps(rec) + "\n", encoding="utf-8")
        (self.d / RESTORE_LOG).write_text(LEGADO, encoding="utf-8")

        merged = load_restore_history(self.d)
        # 2 eventos no log + 1 no jsonl, mas o de 2026-06-29 é o mesmo -> 2 no total
        self.assertEqual(len(merged), 2)
        chaves = sorted((r["arquivo"], r["timestamp"][:10]) for r in merged)
        self.assertEqual(
            chaves,
            [("db-20251201-142700.sql.gz", "2025-12-01"),
             ("db-hml-20260629-103602.sql.gz", "2026-06-29")],
        )
        # o de 2026-06-29 deve vir do jsonl (obs preenchido)
        novo = [r for r in merged if r["arquivo"] == "db-hml-20260629-103602.sql.gz"][0]
        self.assertEqual(novo["_source"], "jsonl")
        self.assertIn("Backup de segurança", novo["obs"])

    def test_ordena_desc_por_data(self):
        (self.d / RESTORE_LOG).write_text(LEGADO, encoding="utf-8")
        merged = load_restore_history(self.d)
        self.assertEqual(merged[0]["timestamp"][:10], "2026-06-29")
        self.assertEqual(merged[1]["timestamp"][:10], "2025-12-01")

    def test_tudo_ausente(self):
        self.assertEqual(load_restore_history(self.d), [])
