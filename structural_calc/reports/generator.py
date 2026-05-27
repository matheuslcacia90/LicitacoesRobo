"""
Geração de memorial de cálculo em PDF usando reportlab.
"""
import io
import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

PAGE_W, PAGE_H = A4

# ---------------------------------------------------------------------------
# Paleta de cores
# ---------------------------------------------------------------------------

AZUL_ESCURO   = colors.HexColor("#1E3A5F")
AZUL_MEDIO    = colors.HexColor("#2563EB")
AZUL_CLARO    = colors.HexColor("#DBEAFE")
VERDE_OK      = colors.HexColor("#15803D")
VERMELHO_NOK  = colors.HexColor("#DC2626")
CINZA_HEADER  = colors.HexColor("#374151")
CINZA_LINHA   = colors.HexColor("#F3F4F6")
BRANCO        = colors.white
PRETO         = colors.black


def _estilos():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="Titulo",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=AZUL_ESCURO,
        spaceAfter=6,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        name="Subtitulo",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=AZUL_ESCURO,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        name="Secao",
        parent=styles["Heading3"],
        fontSize=11,
        textColor=CINZA_HEADER,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        name="Normal2",
        parent=styles["Normal"],
        fontSize=9,
        leading=14,
        spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        name="Formula",
        parent=styles["Normal"],
        fontSize=9,
        fontName="Courier",
        backColor=CINZA_LINHA,
        leftIndent=10,
        rightIndent=10,
        spaceBefore=2,
        spaceAfter=2,
        leading=14,
    ))
    styles.add(ParagraphStyle(
        name="Resultado",
        parent=styles["Normal"],
        fontSize=9,
        textColor=AZUL_ESCURO,
        fontName="Helvetica-Bold",
        spaceBefore=2,
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="Rodape",
        parent=styles["Normal"],
        fontSize=7,
        textColor=colors.grey,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name="Centro",
        parent=styles["Normal"],
        fontSize=9,
        alignment=TA_CENTER,
    ))
    return styles


def _cabecalho_pagina(canvas, doc, projeto: dict):
    """Cabeçalho e rodapé em todas as páginas."""
    canvas.saveState()
    # Linha superior azul
    canvas.setFillColor(AZUL_ESCURO)
    canvas.rect(1 * cm, PAGE_H - 2.0 * cm, PAGE_W - 2 * cm, 1.0 * cm, fill=1, stroke=0)

    canvas.setFillColor(BRANCO)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(1.5 * cm, PAGE_H - 1.5 * cm, "MEMORIAL DE CÁLCULO ESTRUTURAL")
    canvas.setFont("Helvetica", 8)
    proj_info = f"{projeto.get('nome', '')}  |  {projeto.get('responsavel', '')}"
    canvas.drawRightString(PAGE_W - 1.5 * cm, PAGE_H - 1.5 * cm, proj_info)

    # Rodapé
    canvas.setFillColor(CINZA_HEADER)
    canvas.rect(1 * cm, 0.8 * cm, PAGE_W - 2 * cm, 0.5 * cm, fill=1, stroke=0)
    canvas.setFillColor(BRANCO)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(1.5 * cm, 0.95 * cm,
                      f"Gerado em {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}")
    canvas.drawRightString(PAGE_W - 1.5 * cm, 0.95 * cm,
                           f"Página {doc.page}")
    canvas.restoreState()


def gerar_memorial(projeto: dict, calculos: list) -> bytes:
    """
    Gera o memorial de cálculo em PDF.

    projeto: dict com chaves: nome, responsavel, local, data, descricao
    calculos: lista de dicts retornados pelos módulos de cálculo
    Retorna bytes do PDF.
    """
    buf    = io.BytesIO()
    styles = _estilos()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
        title=f"Memorial – {projeto.get('nome', 'Projeto')}",
        author=projeto.get("responsavel", "StructCalc"),
    )

    story = []

    # ------------------------------------------------------------------
    # Capa
    # ------------------------------------------------------------------
    story.append(Spacer(1, 3 * cm))
    story.append(Paragraph("MEMORIAL DE CÁLCULO ESTRUTURAL", styles["Titulo"]))
    story.append(HRFlowable(width="100%", color=AZUL_ESCURO, thickness=2))
    story.append(Spacer(1, 0.5 * cm))

    info_data = [
        ["Projeto:",     projeto.get("nome", "—")],
        ["Local:",       projeto.get("local", "—")],
        ["Data:",        projeto.get("data",  datetime.date.today().strftime("%d/%m/%Y"))],
        ["Responsável:", projeto.get("responsavel", "—")],
        ["Descrição:",   projeto.get("descricao", "—")],
    ]
    t_info = Table(info_data, colWidths=[4 * cm, 12 * cm])
    t_info.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 10),
        ("VALIGN",    (0, 0), (-1, -1), "TOP"),
        ("TEXTCOLOR", (0, 0), (0, -1), AZUL_ESCURO),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [CINZA_LINHA, BRANCO]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
    ]))
    story.append(t_info)
    story.append(Spacer(1, 0.5 * cm))

    # Normas adotadas
    story.append(Paragraph("Normas Adotadas", styles["Secao"]))
    normas = [
        "• NBR 6118:2023 – Projeto de estruturas de concreto",
        "• NBR 6120:2019 – Ações para o cálculo de estruturas de edificações",
        "• NBR 6122:2019 – Projeto e execução de fundações",
        "• NBR 7480:2007 – Aço destinado a armaduras",
        "• NBR 15961-1:2011 – Alvenaria estrutural – blocos cerâmicos",
        "• NBR 8681:2003 – Ações e segurança nas estruturas",
    ]
    for n in normas:
        story.append(Paragraph(n, styles["Normal2"]))
    story.append(PageBreak())

    # ------------------------------------------------------------------
    # Cada cálculo
    # ------------------------------------------------------------------
    for idx, calc in enumerate(calculos, 1):
        tipo    = calc.get("tipo", "Elemento")
        subtipo = calc.get("subtipo", "")
        passos  = calc.get("passos", [])

        titulo_elem = f"{idx}. {tipo}" + (f" – {subtipo}" if subtipo else "")
        story.append(Paragraph(titulo_elem, styles["Subtitulo"]))
        story.append(HRFlowable(width="100%", color=AZUL_CLARO, thickness=1))
        story.append(Spacer(1, 0.2 * cm))

        # Parâmetros de entrada
        _params_resumo(story, styles, calc)

        # Passos do memorial
        for passo in passos:
            bloco = []
            bloco.append(Paragraph(passo.get("titulo", ""), styles["Secao"]))
            formula = passo.get("formula", "")
            if formula:
                bloco.append(Paragraph(formula, styles["Formula"]))
            resultado = passo.get("resultado", "")
            if resultado:
                bloco.append(Paragraph(f"→ {resultado}", styles["Resultado"]))
            aviso = passo.get("aviso")
            if aviso:
                bloco.append(Paragraph(f"⚠ {aviso}", ParagraphStyle(
                    "Aviso", parent=styles["Normal2"], textColor=VERMELHO_NOK, fontName="Helvetica-Bold"
                )))
            bloco.append(Spacer(1, 0.15 * cm))
            story.append(KeepTogether(bloco))

        # Tabela de armação resumida
        _tabela_armacao(story, styles, calc)

        story.append(Spacer(1, 0.5 * cm))
        if idx < len(calculos):
            story.append(PageBreak())

    # ------------------------------------------------------------------
    # Resumo geral de ferragens
    # ------------------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("RESUMO GERAL DE FERRAGENS", styles["Titulo"]))
    story.append(HRFlowable(width="100%", color=AZUL_ESCURO, thickness=2))
    story.append(Spacer(1, 0.3 * cm))

    dados_tabela = [["Nº", "Elemento", "Tipo", "Armadura Principal", "Bitola/Esp.", "Observações"]]
    for idx, calc in enumerate(calculos, 1):
        row = _resumo_row(idx, calc)
        dados_tabela.append(row)

    t_resumo = Table(dados_tabela, colWidths=[1.2*cm, 3.5*cm, 3*cm, 3*cm, 3*cm, 3*cm])
    t_resumo.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), AZUL_ESCURO),
        ("TEXTCOLOR",    (0, 0), (-1, 0), BRANCO),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 7.5),
        ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRANCO, CINZA_LINHA]),
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.grey),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
    ]))
    story.append(t_resumo)

    # ------------------------------------------------------------------
    # Build PDF
    # ------------------------------------------------------------------
    def _hf(canvas, doc):
        _cabecalho_pagina(canvas, doc, projeto)

    doc.build(story, onFirstPage=_hf, onLaterPages=_hf)
    return buf.getvalue()


def _params_resumo(story, styles, calc):
    """Insere mini-tabela com dados de entrada."""
    campos = {
        "fck": "fck (MPa)",
        "aco": "Aço",
        "cobrimento_mm": "Cobrimento (mm)",
        "h_cm": "Espessura (cm)",
        "bw_cm": "Largura bw (cm)",
        "l_m": "Vão L (m)",
        "Nd_kN": "Nd (kN)",
        "H_m": "Altura H (m)",
    }
    data = [["Parâmetro", "Valor"]]
    for key, label in campos.items():
        if key in calc:
            data.append([label, str(calc[key])])

    if len(data) > 1:
        t = Table(data, colWidths=[8 * cm, 4 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0), AZUL_CLARO),
            ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 8.5),
            ("GRID",         (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("TOPPADDING",   (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.25 * cm))


def _tabela_armacao(story, styles, calc):
    """Tabela de dimensionamento da armação."""
    rows = []
    tipo = calc.get("tipo", "")

    if tipo == "Laje Maciça" or tipo == "Laje":
        rows = [
            ["Direção", "As (cm²/m)", "Bitola", "Espaçamento (cm)", "As efetivo (cm²/m)"],
        ]
        bp = calc.get("bitola_principal", {})
        bs = calc.get("bitola_secundaria", {})
        rows.append(["Principal (Lx)",
                     f"{calc.get('As_x_cm2m','—')}",
                     f"Ø{bp.get('diam','—')} mm",
                     f"c/{bp.get('espacamento_cm','—')} cm",
                     f"{bp.get('As_efetivo_cm2m','—')}"])
        rows.append(["Secundária (Ly/dist)",
                     f"{calc.get('As_y_ou_dist_cm2m','—')}",
                     f"Ø{bs.get('diam','—')} mm",
                     f"c/{bs.get('espacamento_cm','—')} cm",
                     f"{bs.get('As_efetivo_cm2m','—')}"])

    elif tipo == "Laje Treliçada":
        rows = [
            ["Local", "As (cm²)", "Bitola", "Obs."],
            ["Nervura (por nervura)",
             f"{calc.get('As_nervura_cm2','—')}",
             f"Ø{calc.get('bitola_nervura',{}).get('diam','—')} mm",
             "Armadura de tração inferior"],
            ["Capa (malha)",
             f"{calc.get('As_capa_cm2m','—')} cm²/m",
             f"Ø{calc.get('bitola_capa',{}).get('diam','—')} mm",
             "Malha eletrossoldada"],
        ]

    elif tipo == "Viga":
        bl = calc.get("bitola_longitudinal", {})
        est = calc.get("estribos", {})
        rows = [
            ["Armadura", "As (cm²)", "Bitola", "Detalhamento"],
            ["Longitudinal (tração)", f"{calc.get('As_lon_cm2','—')}",
             f"Ø{bl.get('diam','—')} mm", f"c/{bl.get('espacamento_cm','—')} cm"],
            ["Transversal (estribos)", "—",
             f"Ø{est.get('phi_estribo_mm','—')} mm {est.get('n_ramos','2')} ramos",
             f"c/{est.get('s_adot_cm','—')} cm"],
        ]

    elif tipo == "Pilar":
        bl = calc.get("bitola_longitudinal", {})
        rows = [
            ["Armadura", "As (cm²)", "Bitola", "Detalhamento"],
            ["Longitudinal (total)", f"{calc.get('As_total_cm2','—')}",
             f"Ø{bl.get('diam','—')} mm", "Distribuídas nas 4 faces"],
            ["Estribos", "—",
             f"Ø{calc.get('phi_estribo_mm','—')} mm",
             f"c/{calc.get('s_estribo_cm','—')} cm"],
        ]

    elif tipo == "Fundação":
        sub = calc.get("subtipo", "")
        if "Sapata" in sub:
            bl = calc.get("bitola", {})
            rows = [
                ["Direção", "As (cm²/m)", "Bitola", "Espaçamento"],
                ["Ambas as direções", f"{calc.get('As_cm2_m','—')}",
                 f"Ø{bl.get('diam','—')} mm", f"c/{bl.get('espacamento_cm','—')} cm"],
            ]
        elif "Baldrame" in sub:
            bl = calc.get("bitola", {})
            rows = [
                ["Armadura", "As (cm²)", "Bitola", "Detalhamento"],
                ["Longitudinal", f"{calc.get('As_lon_cm2','—')}",
                 f"Ø{bl.get('diam','—')} mm", "4 barras mínimo"],
                ["Estribos", "—",
                 f"Ø{calc.get('phi_estribo_mm','—')} mm",
                 f"c/{calc.get('s_estribo_cm','—')} cm"],
            ]

    elif tipo == "Muro de Arrimo":
        bl = calc.get("bitola_tela", {})
        rows = [
            ["Armadura", "As (cm²/m)", "Bitola", "Espaçamento"],
            ["Tela (face aterro)", f"{calc.get('As_tela_cm2m','—')}",
             f"Ø{bl.get('diam','—')} mm", f"c/{bl.get('espacamento_cm','—')} cm"],
        ]

    if rows:
        t = Table(rows, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), AZUL_MEDIO),
            ("TEXTCOLOR",     (0, 0), (-1, 0), BRANCO),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [BRANCO, CINZA_LINHA]),
            ("GRID",          (0, 0), (-1, -1), 0.4, colors.grey),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(Paragraph("Quadro de Armação:", styles["Secao"]))
        story.append(t)


def _resumo_row(idx, calc):
    tipo   = calc.get("tipo", "—")
    sub    = calc.get("subtipo", "—")

    if tipo == "Laje Maciça" or tipo == "Laje":
        bp = calc.get("bitola_principal", {})
        arm = f"{calc.get('As_x_cm2m','—')} cm²/m"
        bit = f"Ø{bp.get('diam','—')} c/{bp.get('espacamento_cm','—')} cm"
        obs = f"h={calc.get('h_cm','—')} cm"
    elif tipo == "Laje Treliçada":
        bn = calc.get("bitola_nervura", {})
        arm = f"{calc.get('As_nervura_cm2','—')} cm²/nerv"
        bit = f"Ø{bn.get('diam','—')} mm"
        obs = f"h={calc.get('h_total_cm','—')} cm"
    elif tipo == "Viga":
        bl = calc.get("bitola_longitudinal", {})
        arm = f"{calc.get('As_lon_cm2','—')} cm²"
        bit = f"Ø{bl.get('diam','—')} mm"
        obs = f"{calc.get('bw_cm','—')}×{calc.get('h_cm','—')} cm"
    elif tipo == "Pilar":
        bl = calc.get("bitola_longitudinal", {})
        arm = f"{calc.get('As_total_cm2','—')} cm²"
        bit = f"Ø{bl.get('diam','—')} mm"
        obs = f"{calc.get('b_cm','—')}×{calc.get('h_cm','—')} cm"
    elif tipo == "Fundação":
        arm = str(calc.get("As_cm2_m", calc.get("As_lon_cm2", "—")))
        bit = "—"
        obs = ""
    elif tipo == "Muro de Arrimo":
        arm = f"{calc.get('As_tela_cm2m','—')} cm²/m"
        bit = "—"
        obs = f"H={calc.get('H_m','—')} m"
    else:
        arm, bit, obs = "—", "—", "—"

    return [str(idx), tipo, sub, arm, bit, obs]
