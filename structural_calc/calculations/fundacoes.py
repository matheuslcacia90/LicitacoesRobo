"""
Cálculo de fundações conforme NBR 6122:2019.
Tipos: Sapata isolada, Sapata corrida (baldrame), Tubulão, Estaca.
"""
import math
from .normas import (
    fcd as calc_fcd, selecionar_bitola,
    GAMMA_G_DESF, GAMMA_Q, ACOS, PESOS, COBRIMENTOS
)

# ---------------------------------------------------------------------------
# Tensão admissível estimada pelo SPT (Terzaghi & Peck simplificado)
# ---------------------------------------------------------------------------

def sigma_admissivel_spt(n_spt: int, tipo_solo: str = "areia") -> float:
    """
    Tensão admissível simplificada baseada no N_SPT [kN/m²].
    NBR 6122 não prescreve fórmulas diretas; usa-se correlação usual.
    """
    correlacoes = {
        "areia":      lambda n: 10 * n,        # kN/m²
        "argila":     lambda n: 7  * n,
        "pedregulho": lambda n: 14 * n,
        "siltosa":    lambda n: 8  * n,
    }
    f = correlacoes.get(tipo_solo, correlacoes["areia"])
    sigma = f(n_spt)
    return min(sigma, 400)   # limite conservador kN/m²


# ===========================================================================
# SAPATA ISOLADA
# ===========================================================================

def calcular_sapata_isolada(
    Nd_kN: float,           # carga de cálculo do pilar
    Nk_kN: float,           # carga característica (serviço)
    b_pilar_m: float,       # menor dim do pilar
    h_pilar_m: float,       # maior dim do pilar
    n_spt: int,
    tipo_solo: str = "areia",
    fck: float = 25.0,
    aco: str   = "CA-50",
    cobrimento_classe: str = "CA-III",
) -> dict:
    """Dimensiona sapata isolada de concreto armado."""
    passos = []

    # 1. Tensão admissível
    sigma_adm = sigma_admissivel_spt(n_spt, tipo_solo)
    passos.append({
        "titulo": "1. Tensão admissível do solo (correlação SPT)",
        "formula": f"σ_adm ≈ {10 if tipo_solo=='areia' else 7}·NSPT = {sigma_adm:.0f} kN/m²",
        "resultado": f"σ_adm = {sigma_adm:.0f} kN/m²"
    })

    # 2. Área necessária (carga serviço + peso próprio estimado 5%)
    Ntotal_k = Nk_kN * 1.05
    A_min = Ntotal_k / sigma_adm
    lado  = math.sqrt(A_min)
    # Arredonda para cima a 5cm
    lado  = math.ceil(lado / 0.05) * 0.05
    passos.append({
        "titulo": "2. Área da sapata",
        "formula": f"A = Nk/σ_adm = {Ntotal_k:.1f}/{sigma_adm:.0f} = {A_min:.3f} m²",
        "resultado": f"Sapata {lado:.2f} × {lado:.2f} m  (quadrada)"
    })

    # 3. Verificação da tensão real
    Pp_sapata = PESOS["concreto_simples"] * lado ** 2 * 0.50   # estimativa
    sigma_real = (Nk_kN + Pp_sapata) / (lado ** 2)
    passos.append({
        "titulo": "3. Verificação de tensão",
        "formula": f"σ = (Nk + PP_sap)/(A) = ({Nk_kN:.1f}+{Pp_sapata:.1f})/{lado:.2f}²",
        "resultado": f"σ_real = {sigma_real:.1f} kN/m²  {'≤' if sigma_real<=sigma_adm else '>'} σ_adm = {sigma_adm:.0f} kN/m²"
    })

    # 4. Altura da sapata
    # Balancete: a = (lado - h_pilar) / 2
    a_m = (lado - h_pilar_m) / 2          # balanço
    h_min_sap = max(a_m * math.tan(math.radians(45)), 0.20)
    h_sap = math.ceil(h_min_sap / 0.05) * 0.05
    passos.append({
        "titulo": "4. Altura da sapata",
        "formula": f"h_sap ≥ a·tan(45°) = {a_m:.2f}×1 = {h_min_sap:.2f} m",
        "resultado": f"h_sap adotado = {h_sap*100:.0f} cm"
    })

    # 5. Momento de dimensionamento
    c_mm  = COBRIMENTOS[cobrimento_classe]["c_nom"]
    d_sap = h_sap - c_mm / 1000 - 0.010   # profundidade útil aprox.
    sigma_d  = Nd_kN / (lado ** 2)   # tensão de cálculo do solo

    # Momento no encastramento do pilar (por metro de largura)
    Md_x = sigma_d * lado * (a_m) ** 2 / 2   # kN.m/m
    passos.append({
        "titulo": "5. Momento de dimensionamento",
        "formula": (f"σ_d = Nd/A = {Nd_kN:.1f}/{lado:.2f}² = {sigma_d:.2f} kN/m²  |  "
                    f"Md = σ_d·Lx·a²/2 = {sigma_d:.2f}×{lado:.2f}×{a_m:.2f}²/2"),
        "resultado": f"Md = {Md_x:.3f} kN.m/m"
    })

    # 6. Armadura
    fcd_val = calc_fcd(fck)
    fyd_val = ACOS[aco]["fyd"]
    Md_Nmm  = Md_x * 1e6
    d_mm    = d_sap * 1e3
    bw_mm   = 1000.0   # por metro de largura
    kMd = Md_Nmm / (fcd_val * bw_mm * d_mm ** 2)
    disc = 0.64 - 1.28 * kMd
    xi   = (0.8 - math.sqrt(max(disc, 0))) / 0.64
    z_mm = d_mm * (1 - 0.4 * xi)
    As_mm2 = Md_Nmm / (fyd_val * z_mm)
    As_cm2 = As_mm2 / 100   # cm²/m

    As_min = 0.0015 * bw_mm * d_mm / 100   # cm²/m
    As_adot = max(As_cm2, As_min)

    passos.append({
        "titulo": "6. Armadura da sapata",
        "formula": (f"kMd={kMd:.4f}  ξ={xi:.4f}  z={z_mm/10:.2f} cm  "
                    f"As_calc={As_cm2:.3f} cm²/m  As_mín={As_min:.3f} cm²/m"),
        "resultado": f"Adotar As = {As_adot:.3f} cm²/m nas duas direções"
    })

    # 7. Puncionamento (simplificado)
    u0 = 2 * (b_pilar_m + h_pilar_m)          # perímetro do pilar
    Vd_punc = Nd_kN - sigma_d * b_pilar_m * h_pilar_m
    tau_punc = (Vd_punc * 1e3) / (u0 * 1e3 * d_sap * 1e3)   # MPa
    tau_punc_Rd = 0.27 * (1 - fck / 250) * fcd_val
    passos.append({
        "titulo": "7. Verificação ao puncionamento",
        "formula": (f"τ_punc = Vd/(u0·d) = {Vd_punc:.2f}×10³/({u0:.2f}×10³×{d_sap*100:.1f}×10)"),
        "resultado": f"τ_punc = {tau_punc:.3f} MPa  {'≤' if tau_punc<=tau_punc_Rd else '>'} τ_Rd = {tau_punc_Rd:.3f} MPa → {'OK' if tau_punc<=tau_punc_Rd else 'VERIFICAR'}"
    })

    bitola = selecionar_bitola(As_adot, espacamento_max_cm=20)

    return {
        "tipo": "Fundação",
        "subtipo": "Sapata Isolada",
        "sigma_adm_kNm2": sigma_adm,
        "sigma_real_kNm2": round(sigma_real, 2),
        "lado_m": lado,
        "h_sap_cm": round(h_sap * 100, 1),
        "d_sap_cm": round(d_sap * 100, 1),
        "Md_kNm_m": round(Md_x, 3),
        "As_cm2_m": round(As_adot, 3),
        "bitola": bitola,
        "punc_ok": tau_punc <= tau_punc_Rd,
        "tensao_ok": sigma_real <= sigma_adm,
        "passos": passos,
        "fck": fck,
        "aco": aco,
    }


# ===========================================================================
# VIGA BALDRAME (Fundação em faixa)
# ===========================================================================

def calcular_viga_baldrame(
    q_kNm: float,           # carga de cálculo por metro (paredes + laje)
    l_m: float,             # vão entre pilares
    n_spt: int,
    tipo_solo: str = "areia",
    fck: float = 25.0,
    aco: str   = "CA-50",
    cobrimento_classe: str = "CA-III",
) -> dict:
    """Dimensiona viga baldrame (fundação corrida em concreto armado)."""
    passos = []

    sigma_adm = sigma_admissivel_spt(n_spt, tipo_solo)
    passos.append({
        "titulo": "1. Tensão admissível",
        "formula": f"σ_adm ≈ {sigma_adm:.0f} kN/m²",
        "resultado": f"σ_adm = {sigma_adm:.0f} kN/m²"
    })

    # Largura mínima da sapata corrida
    b_corr = math.ceil((q_kNm / sigma_adm) / 0.05) * 0.05
    b_corr = max(b_corr, 0.40)
    passos.append({
        "titulo": "2. Largura da sapata corrida",
        "formula": f"b = q/σ_adm = {q_kNm:.1f}/{sigma_adm:.0f} = {q_kNm/sigma_adm:.3f} m",
        "resultado": f"b adotado = {b_corr*100:.0f} cm"
    })

    # Altura mínima da viga baldrame
    h_viga = max(l_m / 15, 0.40)
    h_viga = math.ceil(h_viga / 0.05) * 0.05
    bw_viga = max(0.20, b_corr * 0.6)
    bw_viga = math.ceil(bw_viga / 0.05) * 0.05

    # Inclui a sapata alargada
    passos.append({
        "titulo": "3. Dimensões da viga baldrame",
        "formula": f"h_mín = L/15 = {l_m:.2f}/15 = {l_m/15:.2f} m  |  bw_mín = 20 cm",
        "resultado": f"Viga: {bw_viga*100:.0f} × {h_viga*100:.0f} cm  |  Sapata: {b_corr*100:.0f} cm"
    })

    # Cálculo simplificado como viga contínua
    q_d  = 1.4 * q_kNm
    Md   = q_d * l_m ** 2 / 10   # viga contínua
    Vd   = 0.6 * q_d * l_m

    c_mm = COBRIMENTOS[cobrimento_classe]["c_nom"]
    d    = h_viga - (c_mm + 8 + 12) / 1000

    fcd_val = calc_fcd(fck)
    fyd_val = ACOS[aco]["fyd"]
    Md_Nmm  = Md * 1e6
    bw_mm   = bw_viga * 1e3
    d_mm    = d * 1e3

    kMd = Md_Nmm / (fcd_val * bw_mm * d_mm ** 2)
    disc = 0.64 - 1.28 * kMd
    xi   = (0.8 - math.sqrt(max(disc, 0))) / 0.64
    z_mm = d_mm * (1 - 0.4 * xi)
    As_lon_mm2 = Md_Nmm / (fyd_val * z_mm)
    As_lon = max(As_lon_mm2 / 100, 0.0026 * bw_mm * d_mm / 100)   # cm²

    passos.append({
        "titulo": "4. Flexão e armadura longitudinal",
        "formula": f"Md={Md:.2f} kN.m  kMd={kMd:.4f}  As_calc={As_lon_mm2/100:.3f} cm²",
        "resultado": f"Adotar As_lon = {As_lon:.3f} cm²"
    })

    # Estribos
    VRd1 = 0.25 * fcd_val * bw_mm * d_mm / 1e3   # kN
    s_max = min(h_viga * 100 * 0.6, 30)
    phi_est = 6.3

    passos.append({
        "titulo": "5. Estribos",
        "formula": f"VRd1={VRd1:.2f} kN  Vd={Vd:.2f} kN  s_max={s_max:.0f} cm",
        "resultado": f"Estribos: φ{phi_est} 2R c/{s_max:.0f} cm"
    })

    bitola = selecionar_bitola(As_lon, espacamento_max_cm=100)

    return {
        "tipo": "Fundação",
        "subtipo": "Viga Baldrame",
        "sigma_adm_kNm2": sigma_adm,
        "b_corrida_cm": round(b_corr * 100, 1),
        "bw_viga_cm": round(bw_viga * 100, 1),
        "h_viga_cm": round(h_viga * 100, 1),
        "d_cm": round(d * 100, 1),
        "Md_kNm": round(Md, 3),
        "Vd_kN": round(Vd, 3),
        "As_lon_cm2": round(As_lon, 3),
        "bitola": bitola,
        "phi_estribo_mm": phi_est,
        "s_estribo_cm": s_max,
        "passos": passos,
        "fck": fck,
        "aco": aco,
    }


# ===========================================================================
# ESTACA (dimensionamento geotécnico simplificado)
# ===========================================================================

TIPOS_ESTACA = {
    "concreto_moldada_local":  {"nome": "Concreto moldada no local (escavada)", "alpha": 1.0},
    "pre_moldada_concreto":    {"nome": "Pré-moldada de concreto",              "alpha": 1.0},
    "helice_continua":         {"nome": "Hélice contínua",                      "alpha": 1.3},
    "metalica":                {"nome": "Metálica (cravada)",                   "alpha": 1.0},
    "raiz":                    {"nome": "Raiz",                                 "alpha": 1.5},
    "strauss":                 {"nome": "Strauss",                              "alpha": 0.85},
    "franki":                  {"nome": "Franki",                               "alpha": 1.3},
    "barrete":                 {"nome": "Barrete",                              "alpha": 1.0},
}

def calcular_estaca(
    Nk_kN: float,
    Nd_kN: float,
    n_spt_ponta: int,         # NSPT na ponta da estaca
    n_spt_fuste: float,       # NSPT médio ao longo do fuste
    h_estaca_m: float,        # comprimento
    d_estaca_m: float,        # diâmetro
    tipo_estaca: str = "concreto_moldada_local",
) -> dict:
    """
    Capacidade de carga por Décourt-Quaresma (NBR 6122 Anexo B).
    """
    passos = []
    info   = TIPOS_ESTACA.get(tipo_estaca, TIPOS_ESTACA["concreto_moldada_local"])
    alpha  = info["alpha"]

    A_ponta = math.pi * (d_estaca_m / 2) ** 2
    L_fuste = h_estaca_m
    perimetro = math.pi * d_estaca_m

    # Resistência de ponta (Décourt-Quaresma)
    Np = min(n_spt_ponta, 60)
    qp = 120 * Np   # kPa (solo argilo-siltoso / arenoso genérico)
    Rp = alpha * qp * A_ponta   # kN

    passos.append({
        "titulo": "1. Resistência de ponta (Décourt-Quaresma)",
        "formula": f"qp = 120·Np = 120·{Np} = {qp} kPa  |  Rp = α·qp·Ap = {alpha}×{qp}×{A_ponta:.4f}",
        "resultado": f"Rp = {Rp:.2f} kN"
    })

    # Resistência por atrito lateral
    Nf = min(n_spt_fuste, 60)
    ql = 10 * Nf   # kPa
    Rl = alpha * ql * perimetro * L_fuste   # kN

    passos.append({
        "titulo": "2. Resistência por atrito lateral",
        "formula": f"ql = 10·Nf = 10·{Nf:.1f} = {ql:.0f} kPa  |  Rl = α·ql·P·L = {alpha}×{ql:.0f}×{perimetro:.4f}×{L_fuste:.2f}",
        "resultado": f"Rl = {Rl:.2f} kN"
    })

    # Capacidade total
    Qtotal = Rp + Rl
    # Coeficientes de segurança NBR 6122 Tabela 3
    FS = 2.0
    Qadm = Qtotal / FS

    passos.append({
        "titulo": "3. Capacidade admissível",
        "formula": f"Q_ult = Rp + Rl = {Rp:.2f} + {Rl:.2f} = {Qtotal:.2f} kN  |  FS = {FS}",
        "resultado": f"Q_adm = {Qadm:.2f} kN  vs  Nk = {Nk_kN:.2f} kN → {'OK' if Nk_kN<=Qadm else 'INSUFICIENTE'}"
    })

    # Número mínimo de estacas
    n_estacas = math.ceil(Nk_kN / Qadm)
    n_estacas = max(n_estacas, 1)

    return {
        "tipo": "Fundação",
        "subtipo": f"Estaca – {info['nome']}",
        "d_estaca_m": d_estaca_m,
        "h_estaca_m": h_estaca_m,
        "Rp_kN": round(Rp, 2),
        "Rl_kN": round(Rl, 2),
        "Qtotal_kN": round(Qtotal, 2),
        "Qadm_kN": round(Qadm, 2),
        "n_estacas": n_estacas,
        "capacidade_ok": Nk_kN <= Qadm * n_estacas,
        "passos": passos,
    }
