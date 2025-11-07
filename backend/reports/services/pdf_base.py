# apps/reports/services/pdf_base.py
from io import BytesIO
from typing import Iterable, List, Sequence, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)

# ------------------------------------------------------------
# Helpers de página / layout
# ------------------------------------------------------------
_PAPERS = {
    "A4": A4,
    "LETTER": LETTER,
}

def _page_size(paper: str = "A4", orientation: str = "landscape") -> Tuple[float, float]:
    base = _PAPERS.get((paper or "A4").upper(), A4)
    if (orientation or "landscape").lower() == "portrait":
        return portrait(base)
    return landscape(base)

def _mk_styles(base_font_size: int = 9) -> Tuple[ParagraphStyle, ParagraphStyle]:
    """
    Retorna (estilo_titulo, estilo_celula)
    """
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=max(10, base_font_size + 3),  # título um pouco maior
        leading=max(12, base_font_size + 5),
        spaceAfter=6,
        alignment=0,  # LEFT
    )
    cell = ParagraphStyle(
        name="Cell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=base_font_size,
        leading=base_font_size + 2,
        # wordWrap CJK lida bem com quebras sem hífen
        wordWrap="CJK",
    )
    return title, cell

def _stringify(v) -> str:
    if v is None:
        return ""
    # Evita "True/False" em caixa alta no PDF
    if isinstance(v, bool):
        return "Sim" if v else "Não"
    return str(v)

def _estimate_col_widths(
    header: Sequence[str],
    rows: Sequence[Sequence],
    total_width: float,
    cell_style: ParagraphStyle,
    min_col: float = 30,   # ~ 1.2cm
    max_col: float = 180,  # ~ 7.0cm
    sample_rows: int = 200
) -> List[float]:
    """
    Estima larguras de coluna pelo comprimento de texto (muito rápido e suficiente
    para tabelas administrativas). Limita por min/max e normaliza para caber no total.
    """
    # peso inicial pelo header
    weights = [max(1, len(_stringify(h))) for h in header]

    # Amostra das primeiras linhas para estimativa (limite sample_rows)
    for r in rows[:sample_rows]:
        for i, cell in enumerate(r):
            if i >= len(weights):
                break
            text = _stringify(cell)
            # peso por caracteres, penalizando números curtos
            w = len(text) or 1
            weights[i] = max(weights[i], w)

    # Converte pesos em larguras
    total_weight = float(sum(weights)) or 1.0
    raw_widths = [(w / total_weight) * total_width for w in weights]

    # Aplica min/max por coluna
    clipped = [min(max(min_col, w), max_col) for w in raw_widths]

    # Se a soma estourar/folgar, normaliza para ocupar exatamente o total_width
    s = sum(clipped) or 1.0
    factor = total_width / s
    return [w * factor for w in clipped]

def _as_paragraphs(
    header: Sequence[str],
    rows: Sequence[Sequence],
    cell_style: ParagraphStyle
) -> Tuple[List, List[List]]:
    """
    Converte header/rows para Paragraph, garantindo quebra de linha e consistência visual.
    """
    hdr = [Paragraph(_stringify(h), ParagraphStyle(
        name="Header",
        parent=cell_style,
        fontName="Helvetica-Bold",
    )) for h in header]

    body = []
    for r in rows:
        body.append([Paragraph(_stringify(c), cell_style) for c in r])
    return hdr, body

# ------------------------------------------------------------
# API principal
# ------------------------------------------------------------
def table_to_pdf(
    title: str,
    header: Sequence[str],
    rows: Sequence[Sequence],
    *,
    paper: str = "A4",
    orientation: str = "landscape",
    font_size: int = 9,
    margins: Tuple[float, float, float, float] = (15 * mm, 15 * mm, 14 * mm, 12 * mm),  # L,R,T,B
) -> bytes:
    """
    Gera PDF com:
      • Tamanho de papel configurável (default A4)
      • Orientação 'landscape' por padrão
      • Fonte base configurável (default 9 pt)
      • Cabeçalho repetido em todas as páginas
      • Larguras das colunas autoajustadas para caber na página
      • Quebra de linha nas células (Paragraph + wordWrap)

    Parâmetros podem vir da query string do endpoint (paper, orientation, font_size).
    """
    page_w, page_h = _page_size(paper, orientation)
    left, right, top, bottom = margins
    usable_w = page_w - left - right

    # Estilos
    title_style, cell_style = _mk_styles(int(font_size) if font_size else 9)

    # Converte conteúdo para Paragraph (quebra de linha)
    p_header, p_rows = _as_paragraphs(header, rows, cell_style)

    # Estima larguras para caber na página
    col_widths = _estimate_col_widths(header, rows, usable_w, cell_style)

    # Monta documento
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=(page_w, page_h),
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title=title,
    )

    story = [
        Paragraph(_stringify(title), title_style),
        Spacer(1, 4),
    ]

    data = [p_header] + p_rows
    table = Table(data, repeatRows=1, colWidths=col_widths)

    # Estilo visual da tabela
    table.setStyle(TableStyle([
        # Cabeçalho
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0F0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),

        # Corpo
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), int(font_size) if font_size else 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),

        # Espaçamentos
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),

        # Grade
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),

        # Zebra (opcional, melhora leitura em paisagem)
        ("BACKGROUND", (0, 1), (-1, -1), colors.whitesmoke),
        ("BACKGROUND", (0, 2), (-1, -1), colors.Color(1, 1, 1, alpha=0)),  # limpa baseline
    ]))

    story.append(table)
    doc.build(story)

    pdf = buf.getvalue()
    buf.close()
    return pdf
