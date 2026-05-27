"""
Motor de reconhecimento automático de elementos estruturais.
Extrai elementos de texto proveniente de PDFs, DXFs e IFCs.
"""
import re
from typing import Optional


# ---------------------------------------------------------------------------
# Padrões de regex
# ---------------------------------------------------------------------------

# Dimensões 2D: "3,50 x 4,20", "20x50", "3.50 x 4.20 m", "3.50x4.20"
_PAD_DIM2D = re.compile(
    r"(\d+[.,]?\d*)\s*[xX×]\s*(\d+[.,]?\d*)\s*(?:m|cm)?",
    re.IGNORECASE,
)

# Comprimento/vão: "5,50m", "l = 4.0m", "vão = 6m", "comprimento 5.5m"
_PAD_COMP = re.compile(
    r"(?:l\s*=\s*|v[aã]o\s*=?\s*|comprimento\s*=?\s*|span\s*=?\s*)?(\d+[.,]\d+)\s*m\b",
    re.IGNORECASE,
)

# Cargas distribuídas: "1.5 kN/m²", "2,5 kN/m2", "5 kN/m"
_PAD_CARGA_AREA = re.compile(
    r"(\d+[.,]?\d*)\s*kN\s*/\s*m[²2]",
    re.IGNORECASE,
)
_PAD_CARGA_LINEAR = re.compile(
    r"(\d+[.,]?\d*)\s*kN\s*/\s*m\b",
    re.IGNORECASE,
)

# Forças concentradas: "500 kN", "Nd = 800kN"
_PAD_FORCA = re.compile(
    r"(?:Nd\s*=\s*|N\s*=\s*|P\s*=\s*|Nk\s*=\s*)?(\d+[.,]?\d*)\s*kN\b",
    re.IGNORECASE,
)

# fck: "C25", "C 30", "fck = 25", "concreto 30 MPa", "fck=25MPa"
_PAD_FCK = re.compile(
    r"(?:C\s*(\d+)\b|fck\s*=\s*(\d+)|concreto\s+(\d+))",
    re.IGNORECASE,
)

# SPT: "SPT = 10", "N_SPT=15", "spt 8"
_PAD_SPT = re.compile(
    r"(?:spt\s*=?\s*|n[_-]?spt\s*=?\s*)(\d+)",
    re.IGNORECASE,
)

# Altura de muro/parede: "H = 3.5m", "altura 4m", "h=3m"
_PAD_ALTURA = re.compile(
    r"(?:H\s*=\s*|altura\s*=?\s*)(\d+[.,]?\d*)\s*m",
    re.IGNORECASE,
)

# Ângulo de atrito: "phi = 30", "φ=28°", "ângulo 30"
_PAD_PHI = re.compile(
    r"(?:phi\s*=\s*|φ\s*=\s*|[aâ]ngulo\s+(?:de\s+atrito\s*)?=?\s*)(\d+[.,]?\d*)\s*°?",
    re.IGNORECASE,
)


def _parse_float(s: str) -> float:
    """Converte string com vírgula ou ponto para float."""
    return float(s.replace(",", "."))


def _extrair_fck(texto: str) -> Optional[int]:
    """Extrai fck do texto. Retorna None se não encontrado."""
    for m in _PAD_FCK.finditer(texto):
        val = m.group(1) or m.group(2) or m.group(3)
        if val:
            v = int(val)
            if 15 <= v <= 90:
                return v
    return None


def _extrair_dimensoes_2d(texto: str) -> list[tuple[float, float]]:
    """Extrai pares de dimensões (lx, ly) do texto."""
    pares = []
    for m in _PAD_DIM2D.finditer(texto):
        try:
            a = _parse_float(m.group(1))
            b = _parse_float(m.group(2))
            # filtrar dimensões absurdas
            if 0.1 <= a <= 100 and 0.1 <= b <= 100:
                pares.append((a, b))
        except ValueError:
            pass
    return pares


def _extrair_comprimentos(texto: str) -> list[float]:
    """Extrai comprimentos/vãos em metros."""
    vals = []
    for m in _PAD_COMP.finditer(texto):
        try:
            v = _parse_float(m.group(1))
            if 0.5 <= v <= 50:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _extrair_cargas_area(texto: str) -> list[float]:
    """Extrai cargas de área em kN/m²."""
    vals = []
    for m in _PAD_CARGA_AREA.finditer(texto):
        try:
            v = _parse_float(m.group(1))
            if 0 < v <= 200:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _extrair_cargas_linear(texto: str) -> list[float]:
    """Extrai cargas lineares em kN/m."""
    vals = []
    for m in _PAD_CARGA_LINEAR.finditer(texto):
        try:
            v = _parse_float(m.group(1))
            if 0 < v <= 500:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _extrair_forcas(texto: str) -> list[float]:
    """Extrai forças concentradas em kN."""
    vals = []
    for m in _PAD_FORCA.finditer(texto):
        try:
            v = _parse_float(m.group(1))
            if 1 <= v <= 50000:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _detectar_uso(texto: str) -> str:
    """Detecta uso do edifício."""
    t = texto.lower()
    if any(w in t for w in ["industrial", "galpão", "galpao", "fabril", "armazém", "armazem"]):
        return "industrial"
    if any(w in t for w in ["comercial", "escritório", "escritorio", "loja", "shopping"]):
        return "comercial"
    return "residencial"


def _detectar_aco(texto: str) -> str:
    """Detecta tipo de aço."""
    t = texto.lower()
    if "ca-60" in t or "ca60" in t:
        return "CA-60"
    if "ca-50" in t or "ca50" in t:
        return "CA-50"
    return "CA-50"


def _dim_para_m(val: float, nome_arquivo: str = "") -> float:
    """
    Converte dimensão para metros.
    Se o valor parece estar em cm (>= 10 e <= 200), converte.
    Senão, assume metros.
    """
    if 10 <= val <= 200:
        # Pode ser cm — heurística: se > 20, provavelmente cm
        if val >= 20:
            return val / 100.0
    return val


def _secao_para_m(a: float, b: float) -> tuple[float, float]:
    """
    Determina se o par (a, b) representa uma seção transversal (cm) ou vão (m).
    Seções típicas: 20x50cm, 25x60cm → valores entre 10 e 100
    Vãos típicos: 3.5x4.2m → valores entre 1 e 20
    """
    if a >= 10 and b >= 10 and a <= 100 and b <= 100:
        # Provável seção em cm
        return a / 100.0, b / 100.0
    return a, b


# ---------------------------------------------------------------------------
# Reconhecedores por tipo de elemento
# ---------------------------------------------------------------------------

def _reconhecer_lajes(texto: str, uso: str, fck: int, aco: str) -> list[dict]:
    """Reconhece lajes no texto."""
    elementos = []
    t_lower = texto.lower()

    # Verifica se menciona laje
    if not any(w in t_lower for w in ["laje", "slab", "losa"]):
        return []

    subt = "trelicada" if any(w in t_lower for w in ["treliçada", "trelicada", "treliça", "trelica", "nervurada"]) else "macica"
    tipo_trelica = "12+04"

    # Tentar extrair padrão de treliça: "EI 12+04", "16+04"
    m_trel = re.search(r"(?:EI\s*)?(\d+)\s*\+\s*(\d+)", texto, re.IGNORECASE)
    if m_trel:
        tipo_trelica = f"{m_trel.group(1)}+{m_trel.group(2)}"

    # Cargas
    cargas_area = _extrair_cargas_area(texto)
    g = cargas_area[0] if len(cargas_area) >= 1 else 1.5
    q = cargas_area[1] if len(cargas_area) >= 2 else (1.5 if uso == "residencial" else 3.0)

    suposicoes = []
    confianca = "alta"

    # Dimensões
    dims = _extrair_dimensoes_2d(texto)
    # Filtrar pares que parecem ser dimensões de laje (entre 1 e 20m ou entre 100 e 2000cm)
    laje_dims = [(a, b) for a, b in dims if (1 <= a <= 20 and 1 <= b <= 20) or (100 <= a <= 2000 and 100 <= b <= 2000)]

    if laje_dims:
        a, b = laje_dims[0]
        # Normalizar para metros
        if a > 20:
            a, b = a / 100, b / 100
        lx, ly = min(a, b), max(a, b)
    else:
        # Tentar comprimentos soltos
        comps = _extrair_comprimentos(texto)
        comps = [c for c in comps if 1 <= c <= 20]
        if len(comps) >= 2:
            lx, ly = min(comps[0], comps[1]), max(comps[0], comps[1])
            suposicoes.append(f"Dimensões extraídas de comprimentos: {lx}×{ly}m")
            confianca = "media"
        elif len(comps) == 1:
            lx = comps[0]
            ly = lx * 1.25
            suposicoes.append(f"Apenas um vão encontrado ({lx}m), ly estimado como 1.25×lx")
            confianca = "baixa"
        else:
            lx, ly = 4.0, 5.0
            suposicoes.append("Dimensões padrão 4×5m (não encontradas no texto)")
            confianca = "baixa"

    if not cargas_area:
        suposicoes.append(f"Cargas NBR padrão: g={g}, q={q} kN/m²")
    if fck == 25:
        suposicoes.append("fck=25 MPa (padrão NBR)")

    elementos.append({
        "tipo": "laje",
        "subtipo": subt,
        "lx": round(lx, 2),
        "ly": round(ly, 2),
        "g": g,
        "q": q,
        "fck": fck,
        "aco": aco,
        "cobrimento": "CA-IV",
        "apoio": "simples",
        "uso": uso,
        "tipo_trelica": tipo_trelica,
        "descricao": f"Laje {subt.replace('macica','maciça')} {lx:.2f}×{ly:.2f}m",
        "confianca": confianca,
        "suposicoes": suposicoes,
    })

    return elementos


def _reconhecer_vigas(texto: str, uso: str, fck: int, aco: str) -> list[dict]:
    """Reconhece vigas no texto."""
    elementos = []
    t_lower = texto.lower()

    if not any(w in t_lower for w in ["viga", "beam", "viga principal", "viga secundária"]):
        return []

    suposicoes = []
    confianca = "alta"

    # Cargas
    cargas_lin = _extrair_cargas_linear(texto)
    g = cargas_lin[0] if len(cargas_lin) >= 1 else 5.0
    q = cargas_lin[1] if len(cargas_lin) >= 2 else 3.0
    if not cargas_lin:
        suposicoes.append("Cargas padrão: g=5.0 kN/m, q=3.0 kN/m")

    # Vão
    comps = [c for c in _extrair_comprimentos(texto) if 1 <= c <= 20]
    l = comps[0] if comps else None

    # Seção transversal: buscar par de dimensões tipo "20x50", "25x60" (cm)
    dims = _extrair_dimensoes_2d(texto)
    secao_dims = [(a, b) for a, b in dims if 10 <= a <= 100 and 10 <= b <= 100]

    bw_cm, h_cm = 20.0, 50.0  # padrão
    if secao_dims:
        bw_cm = min(secao_dims[0][0], secao_dims[0][1])
        h_cm = max(secao_dims[0][0], secao_dims[0][1])
        confianca = "alta" if l else "media"
    else:
        suposicoes.append("Seção 20×50cm estimada (padrão NBR)")
        confianca = "media"

    if l is None:
        l = 5.0
        suposicoes.append("Vão 5m estimado")
        confianca = "baixa" if not secao_dims else confianca

    if fck == 25:
        suposicoes.append("fck=25 MPa (padrão NBR)")

    elementos.append({
        "tipo": "viga",
        "l": l,
        "bw_cm": bw_cm,
        "h_cm": h_cm,
        "g": g,
        "q": q,
        "fck": fck,
        "aco": aco,
        "cobrimento": "CA-IV",
        "apoio": "simples",
        "secao": "retangular",
        "descricao": f"Viga {bw_cm:.0f}×{h_cm:.0f}cm L={l:.1f}m",
        "confianca": confianca,
        "suposicoes": suposicoes,
    })

    return elementos


def _reconhecer_pilares(texto: str, fck: int, aco: str) -> list[dict]:
    """Reconhece pilares no texto."""
    elementos = []
    t_lower = texto.lower()

    if not any(w in t_lower for w in ["pilar", "column", "pilar mestre"]):
        return []

    suposicoes = []
    confianca = "alta"

    # Força normal
    forcas = [f for f in _extrair_forcas(texto) if 50 <= f <= 20000]
    Nd = forcas[0] if forcas else None

    if Nd is None:
        Nd = 500.0
        suposicoes.append("Nd=500 kN estimado (padrão)")
        confianca = "baixa"

    # Seção
    dims = _extrair_dimensoes_2d(texto)
    secao_dims = [(a, b) for a, b in dims if 10 <= a <= 100 and 10 <= b <= 100]
    b_cm, h_cm = 20.0, 30.0
    if secao_dims:
        b_cm = min(secao_dims[0][0], secao_dims[0][1])
        h_cm = max(secao_dims[0][0], secao_dims[0][1])
    else:
        suposicoes.append("Seção 20×30cm estimada")
        confianca = "baixa" if Nd == 500.0 else "media"

    # Altura livre
    comps = [c for c in _extrair_comprimentos(texto) if 2 <= c <= 10]
    l = comps[0] if comps else 3.0
    if not comps:
        suposicoes.append("Altura livre 3.0m estimada")

    if fck == 25:
        suposicoes.append("fck=25 MPa (padrão NBR)")

    elementos.append({
        "tipo": "pilar",
        "Nd": Nd,
        "Mx": 0.0,
        "My": 0.0,
        "b_cm": b_cm,
        "h_cm": h_cm,
        "l": l,
        "fck": fck,
        "aco": aco,
        "cobrimento": "CA-IV",
        "vinculo": "biarticulado",
        "forma": "retangular",
        "descricao": f"Pilar {b_cm:.0f}×{h_cm:.0f}cm Nd={Nd:.0f}kN",
        "confianca": confianca,
        "suposicoes": suposicoes,
    })

    return elementos


def _reconhecer_fundacoes(texto: str, fck: int, aco: str) -> list[dict]:
    """Reconhece fundações no texto."""
    elementos = []
    t_lower = texto.lower()

    keywords = {
        "estaca": ["estaca", "pile", "estacas"],
        "viga_baldrame": ["baldrame", "viga de baldrame", "viga baldrame"],
        "sapata_isolada": ["sapata", "footprint", "fundação", "fundacao", "spread footing"],
    }

    # Determinar subtipo
    subtipo = None
    for sub, words in keywords.items():
        if any(w in t_lower for w in words):
            subtipo = sub
            break

    if subtipo is None:
        return []

    suposicoes = []
    confianca = "alta"

    # SPT
    m_spt = _PAD_SPT.search(texto)
    nspt = int(m_spt.group(1)) if m_spt else 10
    if not m_spt:
        suposicoes.append("SPT=10 estimado")
        confianca = "media"

    # Solo
    solo = "areia"
    if any(w in t_lower for w in ["argila", "argiloso", "clay"]):
        solo = "argila"
    elif any(w in t_lower for w in ["silte", "siltoso", "silt"]):
        solo = "silte"

    # Força
    forcas = [f for f in _extrair_forcas(texto) if 50 <= f <= 20000]
    Nd = forcas[0] if forcas else 500.0
    if not forcas:
        suposicoes.append("Nd=500 kN estimado")
        confianca = "baixa"

    if subtipo == "sapata_isolada":
        dims = _extrair_dimensoes_2d(texto)
        secao_dims = [(a, b) for a, b in dims if 10 <= a <= 100 and 10 <= b <= 100]
        b_pilar_cm, h_pilar_cm = 20.0, 30.0
        if secao_dims:
            b_pilar_cm = min(secao_dims[0][0], secao_dims[0][1])
            h_pilar_cm = max(secao_dims[0][0], secao_dims[0][1])
        else:
            suposicoes.append("Seção do pilar 20×30cm estimada")

        elementos.append({
            "tipo": "fundacao",
            "subtipo": "sapata_isolada",
            "Nd": Nd,
            "Nk": round(Nd * 0.72, 1),
            "b_pilar_cm": b_pilar_cm,
            "h_pilar_cm": h_pilar_cm,
            "nspt": nspt,
            "solo": solo,
            "fck": fck,
            "aco": aco,
            "cobrimento": "CA-III",
            "descricao": f"Sapata isolada SPT={nspt} Nd={Nd:.0f}kN",
            "confianca": confianca,
            "suposicoes": suposicoes,
        })

    elif subtipo == "viga_baldrame":
        cargas_lin = _extrair_cargas_linear(texto)
        q = cargas_lin[0] if cargas_lin else 20.0
        comps = [c for c in _extrair_comprimentos(texto) if 1 <= c <= 20]
        l = comps[0] if comps else 4.0
        if not cargas_lin:
            suposicoes.append("Carga linear 20 kN/m estimada")
        if not comps:
            suposicoes.append("Vão 4m estimado")

        elementos.append({
            "tipo": "fundacao",
            "subtipo": "viga_baldrame",
            "q": q,
            "l": l,
            "nspt": nspt,
            "solo": solo,
            "fck": fck,
            "aco": aco,
            "cobrimento": "CA-III",
            "descricao": f"Viga baldrame SPT={nspt} q={q}kN/m",
            "confianca": confianca,
            "suposicoes": suposicoes,
        })

    elif subtipo == "estaca":
        # Dimensão da estaca
        m_diam = re.search(r"(?:d\s*=\s*|diâmetro\s*=?\s*|[Øφ]\s*)(\d+[.,]?\d*)\s*(m|cm)?", texto, re.IGNORECASE)
        d_cm = 35.0
        if m_diam:
            d_val = _parse_float(m_diam.group(1))
            unidade = (m_diam.group(2) or "cm").lower()
            d_cm = d_val * 100 if unidade == "m" else d_val
        else:
            suposicoes.append("Diâmetro 35cm estimado")

        # Comprimento da estaca
        comps = [c for c in _extrair_comprimentos(texto) if 3 <= c <= 50]
        h_estaca = comps[0] if comps else 10.0
        if not comps:
            suposicoes.append("Comprimento 10m estimado")

        tipo_estaca = "concreto_moldada_local"
        if any(w in t_lower for w in ["raiz", "raíz"]):
            tipo_estaca = "raiz"
        elif any(w in t_lower for w in ["precast", "pré-moldada", "pre-moldada"]):
            tipo_estaca = "concreto_pre_moldada"
        elif any(w in t_lower for w in ["metalica", "metálica", "steel"]):
            tipo_estaca = "metalica"

        elementos.append({
            "tipo": "fundacao",
            "subtipo": "estaca",
            "Nk": round(Nd * 0.72, 1),
            "Nd": Nd,
            "nspt_ponta": nspt,
            "nspt_fuste": max(1, nspt - 2),
            "h_estaca": h_estaca,
            "d_estaca_cm": d_cm,
            "tipo_estaca": tipo_estaca,
            "descricao": f"Estaca {tipo_estaca.replace('_',' ')} Ø{d_cm:.0f}cm h={h_estaca}m",
            "confianca": confianca,
            "suposicoes": suposicoes,
        })

    return elementos


def _reconhecer_muro(texto: str, fck: int, aco: str) -> list[dict]:
    """Reconhece muros de arrimo no texto."""
    t_lower = texto.lower()

    if not any(w in t_lower for w in ["muro", "arrimo", "contenção", "contencao", "retaining"]):
        return []

    suposicoes = []
    confianca = "alta"

    # Altura
    m_h = _PAD_ALTURA.search(texto)
    if m_h:
        H = _parse_float(m_h.group(1))
    else:
        comps = [c for c in _extrair_comprimentos(texto) if 1.5 <= c <= 15]
        H = comps[0] if comps else 3.0
        if not comps:
            suposicoes.append("Altura 3.0m estimada")
            confianca = "baixa"

    # Ângulo de atrito
    m_phi = _PAD_PHI.search(texto)
    phi = _parse_float(m_phi.group(1)) if m_phi else 30.0
    if not m_phi:
        suposicoes.append("φ=30° estimado (areia típica)")

    # Peso específico do solo
    m_gamma = re.search(r"(?:γ|gamma)\s*(?:solo|s)?\s*=\s*(\d+[.,]?\d*)", texto, re.IGNORECASE)
    gamma_solo = _parse_float(m_gamma.group(1)) if m_gamma else 18.0
    if not m_gamma:
        suposicoes.append("γ_solo=18 kN/m³ estimado")

    # Sobrecarga
    cargas = _extrair_cargas_area(texto)
    q_sob = cargas[0] if cargas else 0.0

    if fck == 25:
        suposicoes.append("fck=25 MPa (padrão NBR)")

    return [{
        "tipo": "muro",
        "tipo_muro": "balanco",
        "H": H,
        "phi": phi,
        "gamma_solo": gamma_solo,
        "q_sob": q_sob,
        "sigma_adm": 150.0,
        "fck": fck,
        "aco": aco,
        "cobrimento": "CA-II",
        "descricao": f"Muro de arrimo H={H:.1f}m",
        "confianca": confianca,
        "suposicoes": suposicoes,
    }]


def _reconhecer_alvenaria(texto: str, fck: int, aco: str) -> list[dict]:
    """Reconhece alvenaria estrutural no texto."""
    t_lower = texto.lower()

    if not any(w in t_lower for w in ["alvenaria estrutural", "alvenaria", "parede estrutural", "bloco estrutural"]):
        return []

    # Verifica se é realmente estrutural (não apenas vedação)
    if "vedação" in t_lower or "vedacao" in t_lower:
        if "estrutural" not in t_lower:
            return []

    suposicoes = []
    confianca = "media"

    # Carga por metro de parede
    forcas = [f for f in _extrair_forcas(texto) if 1 <= f <= 1000]
    # Para alvenaria, força é em kN/m
    cargas_lin = _extrair_cargas_linear(texto)
    Nd = cargas_lin[0] if cargas_lin else (forcas[0] if forcas else 30.0)
    if not cargas_lin and not forcas:
        suposicoes.append("Nd=30 kN/m estimado")
        confianca = "baixa"

    # Altura da parede
    m_h = _PAD_ALTURA.search(texto)
    comps = [c for c in _extrair_comprimentos(texto) if 2 <= c <= 8]
    if m_h:
        h = _parse_float(m_h.group(1))
    elif comps:
        h = comps[0]
    else:
        h = 3.0
        suposicoes.append("Altura da parede 3.0m estimada")

    # Espessura do bloco
    bloco = "concreto_6MPa"
    e_cm = 14.0
    if any(w in t_lower for w in ["cerâmico", "ceramico", "tijolo cerâmico", "tijolo ceramico"]):
        bloco = "ceramico_4MPa"
        e_cm = 14.0
    elif "8 mpa" in t_lower or "8mpa" in t_lower:
        bloco = "concreto_8MPa"
        e_cm = 19.0
    elif "4 mpa" in t_lower or "4mpa" in t_lower:
        bloco = "ceramico_4MPa"
        e_cm = 14.0

    m_esp = re.search(r"(\d+)\s*cm\b", texto, re.IGNORECASE)
    if m_esp:
        v = float(m_esp.group(1))
        if 10 <= v <= 40:
            e_cm = v

    return [{
        "tipo": "alvenaria",
        "Nd": Nd,
        "h": h,
        "e_cm": e_cm,
        "bloco": bloco,
        "vinculo": "engastado_topo",
        "controle": "normal",
        "descricao": f"Alvenaria estrutural h={h:.1f}m e={e_cm:.0f}cm",
        "confianca": confianca,
        "suposicoes": suposicoes,
    }]


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------

def reconhecer_elementos(texto: str, nome_arquivo: str = "") -> list[dict]:
    """
    Reconhece elementos estruturais em texto extraído de arquivos de projeto.

    Parâmetros
    ----------
    texto : str
        Texto extraído de PDF, DXF, IFC ou descrição do projeto.
    nome_arquivo : str
        Nome do arquivo de origem (usado para heurísticas adicionais).

    Retorna
    -------
    list[dict]
        Lista de dicionários, cada um com campos:
        - tipo: 'laje'|'viga'|'pilar'|'fundacao'|'muro'|'alvenaria'
        - descricao: str
        - confianca: 'alta'|'media'|'baixa'
        - suposicoes: list[str]
        - ... parâmetros para a função de cálculo
    """
    if not texto:
        return []

    t_lower = texto.lower()

    # Palavras-chave estruturais
    palavras_estruturais = [
        "laje", "viga", "pilar", "fundação", "fundacao", "sapata",
        "baldrame", "estaca", "muro", "arrimo", "alvenaria estrutural",
        "alvenaria", "contenção", "contencao",
    ]

    if not any(pw in t_lower for pw in palavras_estruturais):
        return []

    # Contexto global
    fck = _extrair_fck(texto) or 25
    aco = _detectar_aco(texto)
    uso = _detectar_uso(texto)

    elementos = []

    # Reconhecer cada tipo
    elementos.extend(_reconhecer_lajes(texto, uso, fck, aco))
    elementos.extend(_reconhecer_vigas(texto, uso, fck, aco))
    elementos.extend(_reconhecer_pilares(texto, fck, aco))
    elementos.extend(_reconhecer_fundacoes(texto, fck, aco))
    elementos.extend(_reconhecer_muro(texto, fck, aco))
    elementos.extend(_reconhecer_alvenaria(texto, fck, aco))

    # Adicionar fonte
    for e in elementos:
        e["arquivo_origem"] = nome_arquivo

    return elementos
