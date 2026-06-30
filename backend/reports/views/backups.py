# apps/reports/views/backups.py
import json
import re
from datetime import datetime
from pathlib import Path

from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
from django.db.models import Q
from registro.backup import BackupRecord
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import apply_date_filter, text
from ..datetime_utils import fmt_gmt3_with_zone

class BackupsReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        qs = BackupRecord.objects.select_related('executed_by').all().order_by('-created_at')
        qs = apply_date_filter(qs, request, 'created_at')
        usuario = text(request, 'usuario')
        if usuario:
            qs = qs.filter(
                Q(executed_by__username__icontains=usuario)
                | Q(executed_by__first_name__icontains=usuario)
                | Q(executed_by__last_name__icontains=usuario)
            )
        export = request.GET.get('export')
        header = ["Data/Hora","Usuário","Tipo","Status"]
        rows = []
        data = []
        for b in qs:
            tipo = "Automático" if (b.executed_by is None or "celery-auto-backup" in (b.user_agent or "")) else "Manual"
            status = "OK" if b.status == "success" else "Erro"
            ts = fmt_gmt3_with_zone(b.created_at)
            usuario_nome = (b.executed_by.get_full_name() or b.executed_by.username) if b.executed_by else "sistema"
            rows.append([ts,
                         usuario_nome,
                         tipo, status])
            data.append({"timestamp": ts, "usuario": usuario_nome,
                         "tipo": tipo, "status": status})
        if export == 'csv':
            return export_csv("backups", header, rows)
        if export == 'pdf':
            return export_pdf("backups", "Relatório de Backups Executados", header, rows)
        return Response(data)

# =============================================================================
#  Relatório de Restaurações — fonte durável em arquivo (imune a restores)
#
#  Lê o restore_history.jsonl (estruturado, going-forward) e faz merge do
#  restore_history.log legado (histórico), deduplicando por (arquivo, dia).
#  Tudo baseado em arquivo no volume de backup — nenhuma query ao banco, que
#  seria apagado pela própria restauração que se quer registrar.
# =============================================================================

RESTORE_JSONL = "restore_history.jsonl"
RESTORE_LOG = "restore_history.log"

_LOG_LINE = re.compile(r"^\[(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(?P<msg>.*)$")
_SOLICIT = re.compile(
    r"SOLICITA[ÇC][ÃA]O DE RESTORE(?:\s*\((?P<env>[^)]+)\))?\s+por\s+(?P<user>.*?)\.\s*Alvo:\s*(?P<alvo>.+)$"
)
_IP_SUFFIX = re.compile(r"\s*-\s*IP:\s*\S+\s*$")


def _backup_dir() -> Path:
    return Path(getattr(settings, "BACKUP_DIR", "/var/backups/scale"))


def _clean_user(value: str) -> str:
    """Remove o sufixo ' - IP: x.x.x.x' do texto de usuário, para a coluna."""
    if not value:
        return "—"
    return _IP_SUFFIX.sub("", value).strip() or "—"


def _read_jsonl_restores(backup_dir: Path) -> list[dict]:
    """Lê restore_history.jsonl. Tolera arquivo ausente e linhas corrompidas."""
    path = backup_dir / RESTORE_JSONL
    out: list[dict] = []
    if not path.exists():
        return out
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except (ValueError, TypeError):
                    continue
                out.append({
                    "timestamp": rec.get("timestamp") or "",
                    "usuario": rec.get("usuario") or "",
                    "env": rec.get("env") or "",
                    "arquivo": rec.get("arquivo") or "",
                    "resultado": rec.get("resultado") or "",
                    "obs": rec.get("obs") or "",
                    "_source": "jsonl",
                })
    except OSError:
        pass
    return out


def _parse_restore_log(backup_dir: Path) -> list[dict]:
    """Parseia best-effort o restore_history.log legado (texto livre)."""
    path = backup_dir / RESTORE_LOG
    events: list[dict] = []
    cur: dict | None = None
    if not path.exists():
        return events
    try:
        with open(path, encoding="utf-8") as f:
            for raw in f:
                m = _LOG_LINE.match(raw.strip())
                if not m:
                    continue
                ts, msg = m.group("ts"), m.group("msg")
                s = _SOLICIT.search(msg)
                if s:
                    if cur:
                        events.append(cur)
                    cur = {
                        "timestamp": ts,
                        "usuario": s.group("user").strip(),
                        "env": (s.group("env") or "").strip(),
                        "arquivo": Path(s.group("alvo").strip()).name,
                        "resultado": "",
                        "obs": "",
                        "_source": "log",
                    }
                    continue
                if cur is None:
                    continue
                if msg.startswith("SUCESSO"):
                    cur["resultado"] = "sucesso"
                elif msg.startswith("ERRO") or msg.startswith("ABORTADO"):
                    cur["resultado"] = "erro"
                    cur["obs"] = msg
            if cur:
                events.append(cur)
    except OSError:
        pass
    for e in events:
        if not e["resultado"]:
            e["resultado"] = "indeterminado"
    return events


def _dedup_key(rec: dict):
    """Identidade estável de uma restauração: (arquivo, dia)."""
    return (rec.get("arquivo") or "", (rec.get("timestamp") or "")[:10])


def _parse_dt(ts: str):
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def load_restore_history(backup_dir: Path) -> list[dict]:
    """Une jsonl (prioridade) + log legado, deduplicando por (arquivo, dia)."""
    jsonl = _read_jsonl_restores(backup_dir)
    legado = _parse_restore_log(backup_dir)
    seen = {_dedup_key(r) for r in jsonl}
    merged = list(jsonl) + [r for r in legado if _dedup_key(r) not in seen]
    # chave de ordenação naive (timestamps do jsonl são aware, do log são naive)
    merged.sort(
        key=lambda r: (_parse_dt(r.get("timestamp")) or datetime.min).replace(tzinfo=None),
        reverse=True,
    )
    return merged


class RestoresReportView(APIView):
    permission_classes = [IsReportViewer]

    def get(self, request):
        registros = load_restore_history(_backup_dir())

        di = request.GET.get("data_inicial")
        df = request.GET.get("data_final")
        usuario = text(request, "usuario")
        usuario_lower = usuario.lower() if usuario else None

        data, rows = [], []
        header = ["Data/Hora", "Usuário", "Arquivo Origem", "Resultado", "Observações"]
        for r in registros:
            dt = _parse_dt(r.get("timestamp"))
            dia = dt.date().isoformat() if dt else (r.get("timestamp") or "")[:10]
            if di and dia and dia < di:
                continue
            if df and dia and dia > df:
                continue

            usuario_nome = _clean_user(r.get("usuario"))
            if usuario_lower and usuario_lower not in usuario_nome.lower():
                continue

            ts = fmt_gmt3_with_zone(dt) if dt else (r.get("timestamp") or "")
            arquivo = r.get("arquivo") or ""
            resultado = r.get("resultado") or ""
            obs = r.get("obs") or ""

            rows.append([ts, usuario_nome, arquivo, resultado, obs])
            data.append({
                "timestamp": ts,
                "usuario": usuario_nome,
                "arquivo": arquivo,
                "resultado": resultado,
                "obs": obs,
            })

        export = request.GET.get("export")
        if export == "csv":
            return export_csv("restores", header, rows)
        if export == "pdf":
            return export_pdf("restores", "Relatório de Restaurações", header, rows)
        return Response(data)