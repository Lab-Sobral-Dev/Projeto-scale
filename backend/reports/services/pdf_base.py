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
_TABLE_STYLE = [
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0F0")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 2),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
    ("BACKGROUND", (0, 1), (-1, -1), colors.whitesmoke),
    ("BACKGROUND", (0, 2), (-1, -1), colors.Color(1, 1, 1, alpha=0)),
]

_CHUNK_SIZE = 100  # linhas por Table — evita layout O(n²) do ReportLab


def _make_chunk_table(p_header, p_chunk, col_widths, font_size):
    data = [p_header] + p_chunk
    t = Table(data, repeatRows=1, colWidths=col_widths)
    style = list(_TABLE_STYLE)
    style.append(("FONTSIZE", (0, 0), (-1, -1), int(font_size) if font_size else 9))
    t.setStyle(TableStyle(style))
    return t


def table_to_pdf(
    title: str,
    header: Sequence[str],
    rows: Sequence[Sequence],
    *,
    paper: str = "A4",
    orientation: str = "landscape",
    font_size: int = 9,
    margins: Tuple[float, float, float, float] = (15 * mm, 15 * mm, 14 * mm, 12 * mm),
    footer: str | None = None,
) -> bytes:
    """Monta o PDF tabular.

    `footer`, quando informado, imprime uma linha ao final do documento. Serve
    para o relatório declarar a própria completude (ex.: a contagem de
    registros), de modo que um documento incompleto nunca passe por completo.
    """
    page_w, page_h = _page_size(paper, orientation)
    left, right, top, bottom = margins
    usable_w = page_w - left - right

    title_style, cell_style = _mk_styles(int(font_size) if font_size else 9)
    col_widths = _estimate_col_widths(header, rows, usable_w, cell_style)

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

    story = [Paragraph(_stringify(title), title_style), Spacer(1, 4)]

    # Converte header uma vez; processa rows em chunks para evitar layout O(n²)
    p_header, _ = _as_paragraphs(header, [], cell_style)
    for i in range(0, max(len(rows), 1), _CHUNK_SIZE):
        chunk = rows[i:i + _CHUNK_SIZE]
        _, p_chunk = _as_paragraphs(header, chunk, cell_style)
        story.append(_make_chunk_table(p_header, p_chunk, col_widths, font_size))

    if footer:
        footer_style = ParagraphStyle(
            name="Footer",
            parent=cell_style,
            fontName="Helvetica-Oblique",
            textColor=colors.HexColor("#444444"),
        )
        story.append(Spacer(1, 6))
        story.append(Paragraph(_stringify(footer), footer_style))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf
