"""
Constantes e dados das normas brasileiras NBR 6118, NBR 6120, NBR 6122.
"""
import math

# ---------------------------------------------------------------------------
# Concreto – NBR 6118:2023
# ---------------------------------------------------------------------------

CONCRETOS = {
    "C20": {"fck": 20, "fctm": 2.21, "Eci": 25e3, "Ecs": 21e3},
    "C25": {"fck": 25, "fctm": 2.56, "Eci": 28e3, "Ecs": 24e3},
    "C30": {"fck": 30, "fctm": 2.90, "Eci": 31e3, "Ecs": 27e3},
    "C35": {"fck": 35, "fctm": 3.21, "Eci": 33e3, "Ecs": 29e3},
    "C40": {"fck": 40, "fctm": 3.51, "Eci": 35e3, "Ecs": 31e3},
    "C45": {"fck": 45, "fctm": 3.80, "Eci": 37e3, "Ecs": 33e3},
    "C50": {"fck": 50, "fctm": 4.07, "Eci": 38e3, "Ecs": 34e3},
}

GAMMA_C = 1.4   # coeficiente de ponderação do concreto
ALPHA_C = 0.85  # redução por carregamento de longa duração (fck ≤ 50)

def fcd(fck_mpa: float) -> float:
    """Resistência de cálculo do concreto à compressão [MPa]."""
    return ALPHA_C * fck_mpa / GAMMA_C

def fctk_inf(fck_mpa: float) -> float:
    """Resistência inferior à tração [MPa] – NBR 6118 eq. 8.2."""
    if fck_mpa <= 50:
        return 0.7 * 0.3 * fck_mpa ** (2/3)
    return 0.7 * 2.12 * math.log(1 + fck_mpa / 10)

# ---------------------------------------------------------------------------
# Aço – NBR 7480
# ---------------------------------------------------------------------------

ACOS = {
    "CA-50": {"fyk": 500, "fyd": 500 / 1.15, "Es": 210_000},
    "CA-60": {"fyk": 600, "fyd": 600 / 1.15, "Es": 210_000},
}

GAMMA_S = 1.15  # coeficiente de ponderação do aço

# Bitolas disponíveis: diâmetro (mm) → área (mm²)
BITOLAS = {
    6.3: 31.2,
    8.0: 50.3,
    10.0: 78.5,
    12.5: 122.7,
    16.0: 201.1,
    20.0: 314.2,
    25.0: 490.9,
    32.0: 804.2,
}

def area_barra(diam_mm: float) -> float:
    """Área de seção transversal de uma barra [mm²]."""
    return math.pi * (diam_mm / 2) ** 2

# ---------------------------------------------------------------------------
# Bloco equivalente retangular (Whitney-NBR)
# ---------------------------------------------------------------------------
LAMBDA = 0.8   # fator de altura do bloco (fck ≤ 50 MPa)
ETA    = 1.0   # fator de resistência do bloco (fck ≤ 50 MPa)

XI_LIM = 0.45  # limite da relação x/d para ductilidade (fck ≤ 50 MPa)
EPS_CU = 0.0035  # deformação última do concreto [adimensional]

# ---------------------------------------------------------------------------
# Cobrimentos nominais – NBR 6118 Tabela 7.2
# ---------------------------------------------------------------------------

COBRIMENTOS = {
    "CA-I":   {"descricao": "Muito agressivo (XA3, marinha)",   "c_nom": 50},
    "CA-II":  {"descricao": "Agressivo (XC3, industrial)",      "c_nom": 40},
    "CA-III": {"descricao": "Moderado (XC2, urbano interno)",   "c_nom": 30},
    "CA-IV":  {"descricao": "Fraco (XC1, seco/protegido)",      "c_nom": 25},
}

# ---------------------------------------------------------------------------
# Cargas mínimas – NBR 6120:2019 (seleção)
# ---------------------------------------------------------------------------

USOS = {
    "residencial":   {"descricao": "Residencial (dormitórios/salas)",    "q": 1.5},
    "escritorio":    {"descricao": "Escritórios",                        "q": 2.0},
    "comercial_leve":{"descricao": "Lojas e comercial leve",             "q": 3.0},
    "comercial_pesado":{"descricao":"Depósitos e comercial pesado",      "q": 5.0},
    "garagem_leve":  {"descricao": "Garagem veículos leves (≤ 30 kN)",  "q": 3.0},
    "garagem_pesado":{"descricao": "Garagem veículos pesados",           "q": 5.0},
    "cobertura":     {"descricao": "Cobertura não acessível",             "q": 0.5},
    "cobertura_acesso":{"descricao":"Cobertura acessível (terraço)",     "q": 2.0},
    "escada":        {"descricao": "Escadas e corredores",                "q": 3.0},
    "bibioteca":     {"descricao": "Biblioteca/arquivo morto",           "q": 6.0},
}

# ---------------------------------------------------------------------------
# Combinações de ações – NBR 6118 Cap. 11 (simplificada)
# ---------------------------------------------------------------------------

GAMMA_G_DESF = 1.4  # permanente desfavorável
GAMMA_G_FAV  = 0.9  # permanente favorável
GAMMA_Q      = 1.4  # variável

# ---------------------------------------------------------------------------
# Peso específico dos materiais – NBR 6120 Tabela A.1
# ---------------------------------------------------------------------------

PESOS = {
    "concreto_armado": 25.0,   # kN/m³
    "concreto_simples": 24.0,
    "alvenaria_tijolo": 19.0,
    "alvenaria_bloco_cimento": 14.0,
    "alvenaria_bloco_ceramico": 13.0,
    "revestimento_ceramico": 0.6,  # kN/m² por cm
    "contrapiso": 0.21,            # kN/m² por cm
    "terra_umida": 18.0,           # kN/m³
    "argila": 20.0,
}

# ---------------------------------------------------------------------------
# Armaduras mínimas – NBR 6118 Tabela 17.3 (laje e vigas)
# ---------------------------------------------------------------------------

def rho_min_laje(fck_mpa: float, aco: str = "CA-50") -> float:
    """Taxa de armadura mínima para laje (fração, não percentual)."""
    # NBR 6118 Tabela 17.3
    tabela = {
        "CA-50": {20: 0.0015, 25: 0.0016, 30: 0.0018, 35: 0.0020,
                  40: 0.0023, 45: 0.0024, 50: 0.0025},
        "CA-60": {20: 0.0017, 25: 0.0019, 30: 0.0021, 35: 0.0023,
                  40: 0.0027, 45: 0.0028, 50: 0.0029},
    }
    fck_round = min(tabela[aco].keys(), key=lambda k: abs(k - fck_mpa))
    return tabela[aco][fck_round]

def rho_min_viga(fck_mpa: float, aco: str = "CA-50") -> float:
    """Taxa de armadura mínima para viga (NBR 6118 Tabela 17.3)."""
    tabela = {
        "CA-50": {20: 0.0026, 25: 0.0026, 30: 0.0028, 35: 0.0029,
                  40: 0.0031, 45: 0.0033, 50: 0.0033},
        "CA-60": {20: 0.0020, 25: 0.0020, 30: 0.0021, 35: 0.0022,
                  40: 0.0023, 45: 0.0025, 50: 0.0025},
    }
    fck_round = min(tabela[aco].keys(), key=lambda k: abs(k - fck_mpa))
    return tabela[aco][fck_round]

# ---------------------------------------------------------------------------
# Seleção de bitola otimizada
# ---------------------------------------------------------------------------

def selecionar_bitola(As_cm2_por_m: float, espacamento_max_cm: float = 20.0):
    """
    Retorna (diâmetro mm, espaçamento cm, n_barras/m).
    As_cm2_por_m em cm²/m.
    """
    As_mm2_m = As_cm2_por_m * 100  # cm²/m → mm²/m
    resultado = None
    for diam, area_mm2 in sorted(BITOLAS.items()):
        n = As_mm2_m / area_mm2          # barras por metro
        esp = 100.0 / n                   # espaçamento em cm
        if esp >= 5.0:                    # espaçamento mínimo prático
            if esp <= espacamento_max_cm:
                resultado = {"diam": diam, "area_barra_mm2": area_mm2,
                             "espacamento_cm": round(esp, 1),
                             "n_por_metro": round(n, 2),
                             "As_efetivo_cm2m": round(n * area_mm2 / 100, 2)}
                break
    # Se não encontrou dentro do limite, pega a barra mais grossa
    if resultado is None:
        diam = max(BITOLAS.keys())
        area_mm2 = BITOLAS[diam]
        n = As_mm2_m / area_mm2
        esp = 100.0 / n
        resultado = {"diam": diam, "area_barra_mm2": area_mm2,
                     "espacamento_cm": round(esp, 1),
                     "n_por_metro": round(n, 2),
                     "As_efetivo_cm2m": round(n * area_mm2 / 100, 2)}
    return resultado
