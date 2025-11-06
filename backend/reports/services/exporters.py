# apps/reports/services/exporters.py
import csv
from django.http import StreamingHttpResponse, HttpResponse
from pdf_base import table_to_pdf

class Echo:
    def write(self, value): return value

def export_csv(filename: str, header: list[str], rows: list[list]):
    pseudo_buffer = Echo()
    writer = csv.writer(pseudo_buffer, delimiter=';', lineterminator='\n')
    response = StreamingHttpResponse(
        (writer.writerow(header) for _ in [None]) or (),
        content_type='text/csv'
    )
    # Precisamos streamar header + linhas
    def row_iter():
        yield header
        for r in rows:
            yield ["" if v is None else v for v in r]
    response = StreamingHttpResponse((writer.writerow(r) for r in row_iter()),
                                     content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
    return response

def export_pdf(filename: str, title: str, header: list[str], rows: list[list]):
    pdf_bytes = table_to_pdf(title=title, header=header, rows=rows)
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}.pdf"'
    return resp
