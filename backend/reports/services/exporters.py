# apps/reports/services/exporters.py
import csv
from decimal import Decimal
from datetime import date, datetime
from django.http import StreamingHttpResponse, HttpResponse
from .pdf_base import table_to_pdf

# Writer "fake" para o csv.writer (streaming)
class Echo:
    def write(self, value):
        return value

def _to_text(v):
    """Normaliza valores para texto humano em CSV."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "Sim" if v else "Não"
    if isinstance(v, (date, datetime)):
        # ISO curto é bem aceito por Excel/LibreOffice
        try:
            return v.isoformat(sep=" ", timespec="seconds")
        except TypeError:  # date não tem timespec
            return v.isoformat()
    if isinstance(v, Decimal):
        # Evita notação científica
        return format(v, 'f')
    return str(v)

def export_csv(filename: str, header: list[str], rows: list[list]):
    """
    Exporta CSV em streaming com:
      - Delimitador ';' (padrão BR)
      - BOM UTF-8 para abrir corretamente no Excel
      - Conversão de tipos para strings legíveis
    """
    pseudo_buffer = Echo()
    writer = csv.writer(
        pseudo_buffer,
        delimiter=';',
        lineterminator='\n',
        quoting=csv.QUOTE_MINIMAL,
    )

    def row_iter():
        # BOM UTF-8 primeiro (evita acentuação quebrada no Excel)
        yield '\ufeff'
        # Cabeçalho
        yield writer.writerow([_to_text(h) for h in header])
        # Linhas
        for r in rows:
            yield writer.writerow([_to_text(v) for v in r])

    response = StreamingHttpResponse(row_iter(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
    return response

def export_pdf(filename: str, title: str, header: list[str], rows: list[list], **pdf_kwargs):
    """
    Exporta PDF usando o gerador table_to_pdf.
    Aceita kwargs como paper="A4", orientation="landscape", font_size=9, etc.
    """
    pdf_bytes = table_to_pdf(title=title, header=header, rows=rows, **pdf_kwargs)
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
    return resp
