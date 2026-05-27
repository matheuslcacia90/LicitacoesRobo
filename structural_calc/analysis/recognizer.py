"""
Motor de reconhecimento automático de elementos estruturais.
Extrai múltiplos elementos de texto proveniente de PDFs, DXFs e IFCs.
"""
import re
from typing import Optional


# ── Padrões de regex ───────────────────────────────────────────────────────

# Dimensões 2D: "3,50 x 4,20 m", "20x50", "3.50 x 4.20"
_PAD_DIM2D = re.compile(
    r"(\d+[.,]?\d*)\s*[xX×]\s*(\d+[.,]?\d*)\s*(?:m|cm)?",
    re.IGNORECASE,
)

# Comprimento/vão: "5,50m", "l=4.0m", "vão 6m"
_PAD_COMP = re.compile(
    r"(?:l\s*=\s*|v[aã]o\s*=?\s*|comprimento\s*=?\s*|span\s*=?\s*)?(\d+[.,]\d+)\s*m\b",
    re.IGNORECASE,
)

# Cargas de área: "1.5 kN/m²"
_PAD_CARGA_AREA = re.compile(r"(\d+[.,]?\d*)\s*kN\s*/\s*m[²2]", re.IGNORECASE)

# Cargas lineares: "20 kN/m"
_PAD_CARGA_LINEAR = re.compile(r"(\d+[.,]?\d*)\s*kN\s*/\s*m\b", re.IGNORECASE)

# Forças: "500 kN", "Nd=800kN"
_PAD_FORCA = re.compile(
    r"(?:Nd\s*=\s*|N\s*=\s*|P\s*=\s*|Nk\s*=\s*)?(\d{2,5}[.,]?\d*)\s*kN\b",
    re.IGNORECASE,
)

# fck: "C25", "fck=25", "concreto 30"
_PAD_FCK = re.compile(r"(?:C\s*(\d+)\b|fck\s*=\s*(\d+)|concreto\s+(\d+))", re.IGNORECASE)

# SPT
_PAD_SPT = re.compile(r"(?:spt\s*=?\s*|n[_-]?spt\s*=?\s*)(\d+)", re.IGNORECASE)

# Altura: "H=3.5m", "altura 4m"
_PAD_ALTURA = re.compile(r"(?:H\s*=\s*|altura\s*=?\s*)(\d+[.,]?\d*)\s*m", re.IGNORECASE)

# Ângulo de atrito
_PAD_PHI = re.compile(
    r"(?:phi\s*=\s*|φ\s*=\s*|[aâ]ngulo\s+(?:de\s+atrito\s*)?=?\s*)(\d+[.,]?\d*)\s*°?",
    re.IGNORECASE,
)

# ID de elemento: "V1", "P3", "L2", "SP1" etc.
_PAD_ID_ELEM = re.compile(r"\b([VLPSE][a-z]*)\s*(\d+)\b")


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def _extrair_fck(texto: str) -> int:
    for m in _PAD_FCK.finditer(texto):
        val = m.group(1) or m.group(2) or m.group(3)
        if val:
            v = int(val)
            if 15 <= v <= 90:
                return v
    return 25


def _detectar_uso(texto: str) -> str:
    t = texto.lower()
    if any(w in t for w in ["industrial", "galpão", "galpao", "fabril", "armazém"]):
        return "industrial"
    if any(w in t for w in ["comercial", "escritório", "escritorio", "loja", "shopping"]):
        return "comercial"
    return "residencial"


def _detectar_aco(texto: str) -> str:
    return "CA-60" if re.search(r"ca[-\s]?60", texto, re.IGNORECASE) else "CA-50"


def _contexto(texto: str, pos: int, janela: int = 200) -> str:
    """Retorna janela de texto ao redor da posição."""
    return texto[max(0, pos - janela // 2): pos + janela]


def _dims_2d_proximo(ctx: str) -> list[tuple[float, float]]:
    pares = []
    for m in _PAD_DIM2D.finditer(ctx):
        try:
            a, b = _f(m.group(1)), _f(m.group(2))
            if 0.1 <= a <= 200 and 0.1 <= b <= 200:
                pares.append((a, b))
        except ValueError:
            pass
    return pares


def _comprimentos_proximos(ctx: str) -> list[float]:
    vals = []
    for m in _PAD_COMP.finditer(ctx):
        try:
            v = _f(m.group(1))
            if 0.5 <= v <= 50:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _forcas_proximas(ctx: str) -> list[float]:
    vals = []
    for m in _PAD_FORCA.finditer(ctx):
        try:
            v = _f(m.group(1))
            if 50 <= v <= 30000:
                vals.append(v)
        except ValueError:
            pass
    return vals


def _cargas_area_proximas(ctx: str) -> list[float]:
    return [_f(m.group(1)) for m in _PAD_CARGA_AREA.finditer(ctx)
            if 0 < _f(m.group(1)) <= 200]


def _cargas_lin_proximas(ctx: str) -> list[float]:
    return [_f(m.group(1)) for m in _PAD_CARGA_LINEAR.finditer(ctx)
            if 0 < _f(m.group(1)) <= 500]


def _id_elemento(ctx: str) -> str:
    """Extrai ID como 'V1', 'P3', etc."""
    m = _PAD_ID_ELEM.search(ctx)
    return f"{m.group(1)}{m.group(2)}" if m else ""


def _dim_laje(a: float, b: float) -> tuple[float, float] | None:
    """Converte par de dimensões para metros de laje (lx, ly)."""
    if a > 20:
        a, b = a / 100, b / 100
    if 1.0 <= a <= 20 and 1.0 <= b <= 20:
        return min(a, b), max(a, b)
    return None


def _dim_secao(a: float, b: float) -> tuple[float, float] | None:
    """Converte par para seção transversal (bw_cm, h_cm)."""
    if 10 <= a <= 120 and 10 <= b <= 120:
        return min(a, b), max(a, b)
    return None


# ── Reconhecedores por tipo ────────────────────────────────────────────────

def _reconhecer_lajes(texto: str, uso: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    if not any(w in t for w in ["laje", "slab"]):
        return []

    elementos = []
    # Encontra todos os blocos de "laje" no texto
    for m in re.finditer(r"laje\s*\w*", t):
        pos = m.start()
        ctx = _contexto(texto, pos, 300)
        ctx_lower = ctx.lower()

        subt = "trelicada" if any(w in ctx_lower for w in ["treliç", "trelica", "nervur"]) else "macica"

        # Tipo de treliça
        tipo_trelica = "12+04"
        mt = re.search(r"(?:EI\s*)?(\d{2})\s*\+\s*(\d{2})", ctx, re.IGNORECASE)
        if mt:
            tipo_trelica = f"{mt.group(1)}+{mt.group(2)}"

        dims = _dims_2d_proximo(ctx)
        laje_dim = None
        for a, b in dims:
            laje_dim = _dim_laje(a, b)
            if laje_dim:
                break

        suposicoes, confianca = [], "alta"
        if laje_dim:
            lx, ly = laje_dim
        else:
            comps = _comprimentos_proximos(ctx)
            comps = [c for c in comps if 1 <= c <= 20]
            if len(comps) >= 2:
                lx, ly = min(comps[0], comps[1]), max(comps[0], comps[1])
                confianca = "media"
            elif len(comps) == 1:
                lx = comps[0]; ly = round(lx * 1.25, 2)
                suposicoes.append(f"ly estimado como 1,25×lx ({ly}m)")
                confianca = "media"
            else:
                lx, ly = 4.0, 5.0
                suposicoes.append("Dimensões padrão 4×5m (não encontradas)")
                confianca = "baixa"

        cargas = _cargas_area_proximas(ctx)
        g = cargas[0] if len(cargas) >= 1 else 1.5
        q = cargas[1] if len(cargas) >= 2 else (1.5 if uso == "residencial" else 3.0)
        if not cargas:
            suposicoes.append(f"Cargas NBR: g={g} q={q} kN/m²")

        eid = _id_elemento(ctx)
        desc = f"Laje {subt.replace('macica','maciça')} {eid} {lx:.2f}×{ly:.2f}m".strip()

        elementos.append({
            "tipo": "laje", "subtipo": subt,
            "lx": round(lx, 2), "ly": round(ly, 2),
            "g": g, "q": q, "fck": fck, "aco": aco,
            "cobrimento": "CA-IV", "apoio": "simples",
            "uso": uso, "tipo_trelica": tipo_trelica,
            "descricao": desc,
            "confianca": confianca, "suposicoes": suposicoes,
        })

    return elementos


def _reconhecer_vigas(texto: str, uso: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    if not any(w in t for w in ["viga", "beam"]):
        return []

    elementos = []
    for m in re.finditer(r"viga\s*\w*", t):
        pos = m.start()
        ctx = _contexto(texto, pos, 300)

        suposicoes, confianca = [], "alta"

        # Seção: par de dims tipo 20×50
        dims = _dims_2d_proximo(ctx)
        bw_cm, h_cm = 20.0, 50.0
        secao_ok = False
        for a, b in dims:
            s = _dim_secao(a, b)
            if s:
                bw_cm, h_cm = s
                secao_ok = True
                break
        if not secao_ok:
            suposicoes.append("Seção 20×50cm estimada")
            confianca = "media"

        # Vão
        comps = [c for c in _comprimentos_proximos(ctx) if 1 <= c <= 20]
        l = comps[0] if comps else None
        if l is None:
            l = 5.0
            suposicoes.append("Vão 5m estimado")
            confianca = "baixa" if not secao_ok else confianca

        cargas = _cargas_lin_proximas(ctx)
        g = cargas[0] if len(cargas) >= 1 else 5.0
        q = cargas[1] if len(cargas) >= 2 else 3.0
        if not cargas:
            suposicoes.append("Cargas padrão: g=5 q=3 kN/m")

        eid = _id_elemento(ctx)
        desc = f"Viga {eid} {bw_cm:.0f}×{h_cm:.0f}cm L={l:.1f}m".strip()

        elementos.append({
            "tipo": "viga", "l": l,
            "bw_cm": bw_cm, "h_cm": h_cm,
            "g": g, "q": q, "fck": fck, "aco": aco,
            "cobrimento": "CA-IV", "apoio": "simples", "secao": "retangular",
            "descricao": desc,
            "confianca": confianca, "suposicoes": suposicoes,
        })

    return elementos


def _reconhecer_pilares(texto: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    if not any(w in t for w in ["pilar", "column", "coluna"]):
        return []

    elementos = []
    for m in re.finditer(r"pilar\s*\w*", t):
        pos = m.start()
        ctx = _contexto(texto, pos, 300)

        suposicoes, confianca = [], "alta"

        dims = _dims_2d_proximo(ctx)
        b_cm, h_cm = 20.0, 30.0
        secao_ok = False
        for a, b in dims:
            s = _dim_secao(a, b)
            if s:
                b_cm, h_cm = s
                secao_ok = True
                break
        if not secao_ok:
            suposicoes.append("Seção 20×30cm estimada")
            confianca = "media"

        forcas = _forcas_proximas(ctx)
        Nd = forcas[0] if forcas else None
        if Nd is None:
            Nd = 500.0
            suposicoes.append("Nd=500 kN estimado")
            confianca = "baixa" if not secao_ok else confianca

        comps = [c for c in _comprimentos_proximos(ctx) if 2 <= c <= 10]
        l = comps[0] if comps else 3.0
        if not comps:
            suposicoes.append("Altura livre 3.0m estimada")

        eid = _id_elemento(ctx)
        desc = f"Pilar {eid} {b_cm:.0f}×{h_cm:.0f}cm Nd={Nd:.0f}kN".strip()

        elementos.append({
            "tipo": "pilar",
            "Nd": Nd, "Mx": 0.0, "My": 0.0,
            "b_cm": b_cm, "h_cm": h_cm, "l": l,
            "fck": fck, "aco": aco, "cobrimento": "CA-IV",
            "vinculo": "biarticulado", "forma": "retangular",
            "descricao": desc,
            "confianca": confianca, "suposicoes": suposicoes,
        })

    return elementos


def _reconhecer_fundacoes(texto: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    kw_map = {
        "estaca":        ["estaca", "estacas", "pile"],
        "viga_baldrame": ["baldrame", "viga de baldrame", "viga baldrame"],
        "sapata_isolada":["sapata", "fundação", "fundacao", "spread footing"],
    }

    elementos = []
    m_spt = _PAD_SPT.search(texto)
    nspt_global = int(m_spt.group(1)) if m_spt else 10

    solo = "areia"
    if any(w in t for w in ["argila", "argiloso", "clay"]):
        solo = "argila"
    elif any(w in t for w in ["silte", "siltoso"]):
        solo = "siltosa"

    for subtipo, palavras in kw_map.items():
        for palavra in palavras:
            for m in re.finditer(re.escape(palavra), t):
                pos = m.start()
                ctx = _contexto(texto, pos, 300)

                suposicoes, confianca = [], "alta"

                ms = _PAD_SPT.search(ctx)
                nspt = int(ms.group(1)) if ms else nspt_global
                if not ms and not m_spt:
                    suposicoes.append("SPT=10 estimado")
                    confianca = "media"

                forcas = _forcas_proximas(ctx)
                Nd = forcas[0] if forcas else 500.0
                if not forcas:
                    suposicoes.append("Nd=500 kN estimado")
                    confianca = "baixa"

                eid = _id_elemento(ctx)

                if subtipo == "sapata_isolada":
                    dims = _dims_2d_proximo(ctx)
                    b_p, h_p = 20.0, 30.0
                    for a, b in dims:
                        s = _dim_secao(a, b)
                        if s:
                            b_p, h_p = s
                            break

                    elementos.append({
                        "tipo": "fundacao", "subtipo": "sapata_isolada",
                        "Nd": Nd, "Nk": round(Nd * 0.72, 1),
                        "b_pilar_cm": b_p, "h_pilar_cm": h_p,
                        "nspt": nspt, "solo": solo,
                        "fck": fck, "aco": aco, "cobrimento": "CA-III",
                        "descricao": f"Sapata {eid} SPT={nspt} Nd={Nd:.0f}kN".strip(),
                        "confianca": confianca, "suposicoes": suposicoes,
                    })

                elif subtipo == "viga_baldrame":
                    cargas = _cargas_lin_proximas(ctx)
                    q = cargas[0] if cargas else 20.0
                    comps = [c for c in _comprimentos_proximos(ctx) if 1 <= c <= 20]
                    l = comps[0] if comps else 4.0
                    if not cargas:
                        suposicoes.append("Carga linear 20 kN/m estimada")
                    if not comps:
                        suposicoes.append("Vão 4m estimado")

                    elementos.append({
                        "tipo": "fundacao", "subtipo": "viga_baldrame",
                        "q": q, "l": l, "nspt": nspt, "solo": solo,
                        "fck": fck, "aco": aco, "cobrimento": "CA-III",
                        "descricao": f"Viga baldrame {eid} SPT={nspt} q={q}kN/m".strip(),
                        "confianca": confianca, "suposicoes": suposicoes,
                    })

                elif subtipo == "estaca":
                    md = re.search(r"(?:d\s*=\s*|[Øφ]\s*)(\d+[.,]?\d*)\s*(m|cm)?", ctx, re.IGNORECASE)
                    d_cm = _f(md.group(1)) * (100 if (md.group(2) or "cm").lower() == "m" else 1) if md else 35.0
                    if not md:
                        suposicoes.append("Diâmetro 35cm estimado")

                    comps = [c for c in _comprimentos_proximos(ctx) if 3 <= c <= 50]
                    h_e = comps[0] if comps else 10.0
                    if not comps:
                        suposicoes.append("Comprimento 10m estimado")

                    tipo_estaca = "concreto_moldada_local"
                    if "raiz" in ctx.lower():
                        tipo_estaca = "raiz"
                    elif any(w in ctx.lower() for w in ["pré-moldada", "pre-moldada", "precast"]):
                        tipo_estaca = "concreto_pre_moldada"

                    elementos.append({
                        "tipo": "fundacao", "subtipo": "estaca",
                        "Nk": round(Nd * 0.72, 1), "Nd": Nd,
                        "nspt_ponta": nspt, "nspt_fuste": max(1, nspt - 3),
                        "h_estaca": h_e, "d_estaca_cm": d_cm,
                        "tipo_estaca": tipo_estaca,
                        "descricao": f"Estaca {eid} Ø{d_cm:.0f}cm h={h_e}m".strip(),
                        "confianca": confianca, "suposicoes": suposicoes,
                    })

                break  # apenas primeira ocorrência de cada palavra-chave

    return elementos


def _reconhecer_muro(texto: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    if not any(w in t for w in ["muro", "arrimo", "contenção", "contencao", "retaining"]):
        return []

    elementos = []
    for m in re.finditer(r"muro\s*\w*", t):
        pos = m.start()
        ctx = _contexto(texto, pos, 300)

        suposicoes, confianca = [], "alta"

        mh = _PAD_ALTURA.search(ctx)
        if mh:
            H = _f(mh.group(1))
        else:
            comps = [c for c in _comprimentos_proximos(ctx) if 1.5 <= c <= 15]
            H = comps[0] if comps else 3.0
            if not comps:
                suposicoes.append("Altura 3.0m estimada")
                confianca = "baixa"

        mp = _PAD_PHI.search(ctx)
        phi = _f(mp.group(1)) if mp else 30.0
        if not mp:
            suposicoes.append("φ=30° estimado")

        mg = re.search(r"(?:γ|gamma)\s*(?:solo)?\s*=\s*(\d+[.,]?\d*)", ctx, re.IGNORECASE)
        gamma = _f(mg.group(1)) if mg else 18.0
        if not mg:
            suposicoes.append("γ_solo=18 kN/m³ estimado")

        cargas = _cargas_area_proximas(ctx)
        q_sob = cargas[0] if cargas else 0.0

        eid = _id_elemento(ctx)
        elementos.append({
            "tipo": "muro", "tipo_muro": "balanco",
            "H": H, "phi": phi, "gamma_solo": gamma,
            "q_sob": q_sob, "sigma_adm": 150.0,
            "fck": fck, "aco": aco, "cobrimento": "CA-II",
            "descricao": f"Muro de arrimo {eid} H={H:.1f}m".strip(),
            "confianca": confianca, "suposicoes": suposicoes,
        })

    return elementos


def _reconhecer_alvenaria(texto: str, fck: int, aco: str) -> list[dict]:
    t = texto.lower()
    if not any(w in t for w in ["alvenaria estrutural", "parede estrutural", "bloco estrutural"]):
        return []

    elementos = []
    for m in re.finditer(r"alvenaria\s+estrutural|parede\s+estrutural", t):
        pos = m.start()
        ctx = _contexto(texto, pos, 300)
        ctx_lower = ctx.lower()

        suposicoes, confianca = [], "media"

        cargas = _cargas_lin_proximas(ctx)
        Nd = cargas[0] if cargas else 30.0
        if not cargas:
            suposicoes.append("Nd=30 kN/m estimado")
            confianca = "baixa"

        mh = _PAD_ALTURA.search(ctx)
        comps = [c for c in _comprimentos_proximos(ctx) if 2 <= c <= 8]
        h = _f(mh.group(1)) if mh else (comps[0] if comps else 3.0)
        if not mh and not comps:
            suposicoes.append("Altura da parede 3.0m estimada")

        bloco, e_cm = "concreto_6MPa", 14.0
        if any(w in ctx_lower for w in ["cerâmico", "ceramico", "tijolo"]):
            bloco, e_cm = "ceramico_4MPa", 14.0
        elif "8 mpa" in ctx_lower or "8mpa" in ctx_lower:
            bloco, e_cm = "concreto_8MPa", 19.0

        me = re.search(r"(\d+)\s*cm\b", ctx, re.IGNORECASE)
        if me:
            v = float(me.group(1))
            if 10 <= v <= 40:
                e_cm = v

        eid = _id_elemento(ctx)
        elementos.append({
            "tipo": "alvenaria",
            "Nd": Nd, "h": h, "e_cm": e_cm, "bloco": bloco,
            "vinculo": "engastado_topo", "controle": "normal",
            "descricao": f"Alvenaria estrutural {eid} h={h:.1f}m e={e_cm:.0f}cm".strip(),
            "confianca": confianca, "suposicoes": suposicoes,
        })

    return elementos


# ── Função principal ───────────────────────────────────────────────────────

def reconhecer_elementos(texto: str, nome_arquivo: str = "") -> list[dict]:
    """
    Reconhece elementos estruturais em texto extraído de arquivos de projeto.
    Retorna lista de dicts prontos para as funções de cálculo.
    """
    if not texto or not texto.strip():
        return []

    t = texto.lower()
    palavras_est = [
        "laje", "viga", "pilar", "fundação", "fundacao", "sapata",
        "baldrame", "estaca", "muro", "arrimo", "alvenaria estrutural",
        "contenção", "contencao",
    ]
    if not any(pw in t for pw in palavras_est):
        return []

    fck = _extrair_fck(texto)
    aco = _detectar_aco(texto)
    uso = _detectar_uso(texto)

    elementos = []
    elementos.extend(_reconhecer_lajes(texto, uso, fck, aco))
    elementos.extend(_reconhecer_vigas(texto, uso, fck, aco))
    elementos.extend(_reconhecer_pilares(texto, fck, aco))
    elementos.extend(_reconhecer_fundacoes(texto, fck, aco))
    elementos.extend(_reconhecer_muro(texto, fck, aco))
    elementos.extend(_reconhecer_alvenaria(texto, fck, aco))

    for e in elementos:
        e["arquivo_origem"] = nome_arquivo

    return elementos
