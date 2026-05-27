"""
Cálculo de lajes conforme NBR 6118:2023.
Suporta: laje maciça (unidirecional / bidirecional) e laje treliçada.
"""
import math
from .normas import (
    fcd as calc_fcd, rho_min_laje, selecionar_bitola,
    GAMMA_G_DESF, GAMMA_Q, LAMBDA, XI_LIM, ALPHA_C, GAMMA_C, ACOS,
    PESOS, COBRIMENTOS
)


# ---------------------------------------------------------------------------
# Espessura mínima – NBR 6118 Tabela 13.2
# ---------------------------------------------------------------------------

def espessura_minima(lx_m: float, tipo_apoio: str, uso: str = "normal") -> float:
    """
    Espessura mínima de laje maciça em metros.
    tipo_apoio: 'simples' | 'continua' | 'balanco'
    uso: 'cobertura' | 'normal' | 'veiculo'
    """
    fatores = {"simples": 1/35, "continua": 1/40, "balanco": 1/10}
    h_vao = lx_m * fatores.get(tipo_apoio, 1/35)
    minimos = {"cobertura": 0.07, "normal": 0.07, "veiculo": 0.08}
    h_min = minimos.get(uso, 0.07)
    return round(max(h_vao, h_min), 3)


# ---------------------------------------------------------------------------
# Bloco retangular equivalente – resolve ξ dado kMd
# ---------------------------------------------------------------------------

def _xi_de_kMd(kMd: float, fck: float) -> float:
    """
    Calcula a relação x/d usando o bloco equivalente retangular (NBR 6118).
    kMd = Md / (fcd * b * d²)  (adimensional)
    Retorna ξ = x/d.
    """
    # kMd = 0.8*ξ*(1-0.4*ξ)  → 0.32ξ² - 0.8ξ + kMd = 0
    discriminante = 0.64 - 1.28 * kMd
    if discriminante < 0:
        return float("inf")   # seção insuficiente
    xi = (0.8 - math.sqrt(discriminante)) / 0.64
    return xi


def _armadura_secao(Md_kNm: float, b_m: float, d_m: float,
                     fck: float, aco: str) -> dict:
    """
    Calcula As necessária para momento Md [kN.m] em seção retangular.
    Retorna dict com ξ, z, As_cm2, aviso.
    """
    fcd_val = calc_fcd(fck)   # MPa
    fyd_val = ACOS[aco]["fyd"]  # MPa

    # Converter Md para N·m → N·mm: Md [kN.m] * 1e6 [N·mm / kN·m]
    Md_Nmm  = Md_kNm * 1e6
    b_mm    = b_m * 1e3
    d_mm    = d_m * 1e3

    kMd = Md_Nmm / (fcd_val * b_mm * d_mm ** 2)
    xi  = _xi_de_kMd(kMd, fck)

    aviso = None
    if xi > XI_LIM:
        aviso = f"ξ={xi:.3f} > ξlim={XI_LIM} → aumentar seção ou usar dupla armadura"
        xi = XI_LIM  # limita para cálculo de As (conservador)

    z_mm = d_mm * (1 - 0.4 * xi)          # braço de alavanca [mm]
    As_mm2 = Md_Nmm / (fyd_val * z_mm)    # [mm²]
    As_cm2  = As_mm2 / 100               # mm²/m → cm²/m (b=1m)

    return {"kMd": round(kMd, 4), "xi": round(xi, 4),
            "z_cm": round(z_mm / 10, 2), "As_cm2": round(As_cm2, 3),
            "aviso": aviso}


# ===========================================================================
# LAJE MACIÇA
# ===========================================================================

def calcular_laje_macica(
    lx_m: float,
    ly_m: float,
    g_kNm2: float,        # carga permanente (sem PP)
    q_kNm2: float,        # carga variável
    fck: float,
    aco: str = "CA-50",
    cobrimento_classe: str = "CA-IV",
    tipo_apoio: str = "simples",
    uso: str = "normal",
) -> dict:
    """
    Calcula laje maciça unidirecional ou bidirecional.
    Retorna dict com todos os resultados e passos do memorial.
    """
    passos = []

    # 1. Espessura mínima
    h = espessura_minima(lx_m, tipo_apoio, uso)
    passos.append({
        "titulo": "1. Espessura mínima (NBR 6118 Tabela 13.2)",
        "formula": f"h = L/{'35' if tipo_apoio=='simples' else '40' if tipo_apoio=='continua' else '10'} = {lx_m:.2f}/{'35' if tipo_apoio=='simples' else '40' if tipo_apoio=='continua' else '10'}",
        "resultado": f"h adotado = {h*100:.1f} cm"
    })

    # 2. Peso próprio
    PP = PESOS["concreto_armado"] * h   # kN/m²
    g_total = g_kNm2 + PP
    passos.append({
        "titulo": "2. Peso próprio",
        "formula": f"PP = γ_c × h = 25 × {h:.3f} = {PP:.2f} kN/m²",
        "resultado": f"g_total = {g_kNm2:.2f} + {PP:.2f} = {g_total:.2f} kN/m²"
    })

    # 3. Carga de cálculo (ELU)
    q_d = GAMMA_G_DESF * g_total + GAMMA_Q * q_kNm2
    passos.append({
        "titulo": "3. Ações de cálculo (ELU)",
        "formula": f"q_d = γ_g·g + γ_q·q = 1.4×{g_total:.2f} + 1.4×{q_kNm2:.2f}",
        "resultado": f"q_d = {q_d:.2f} kN/m²"
    })

    # 4. Classificação direcional
    ratio = ly_m / lx_m
    bidirecional = ratio <= 2.0
    tipo_direcao = "Bidirecional" if bidirecional else "Unidirecional"
    passos.append({
        "titulo": "4. Classificação direcional",
        "formula": f"λ = Ly/Lx = {ly_m:.2f}/{lx_m:.2f} = {ratio:.2f}",
        "resultado": f"Laje {tipo_direcao} (λ {'≤' if bidirecional else '>'} 2,0)"
    })

    # 5. Momento de cálculo
    if bidirecional:
        # Tabela de Marcus (coeficientes simplificados)
        alfa_x, alfa_y = _coeficientes_marcus(ratio, tipo_apoio)
        Mx = alfa_x * q_d * lx_m ** 2   # kN.m/m
        My = alfa_y * q_d * lx_m ** 2
        passos.append({
            "titulo": "5. Momentos (Tabela de Marcus)",
            "formula": f"αx={alfa_x:.4f}, αy={alfa_y:.4f}",
            "resultado": f"Mx = {Mx:.2f} kN.m/m  |  My = {My:.2f} kN.m/m"
        })
    else:
        coef_M = {"simples": 1/8, "continua": 1/10, "balanco": 1/2}
        cM = coef_M.get(tipo_apoio, 1/8)
        Mx = cM * q_d * lx_m ** 2
        My = 0.0
        passos.append({
            "titulo": "5. Momento máximo",
            "formula": f"M = (1/{int(1/cM)}) × q_d × L² = (1/{int(1/cM)}) × {q_d:.2f} × {lx_m:.2f}²",
            "resultado": f"M = {Mx:.2f} kN.m/m"
        })

    # 6. Cobrimento e altura útil
    c_mm = COBRIMENTOS[cobrimento_classe]["c_nom"]
    phi_l = 8      # diâmetro estimado da armadura principal [mm]
    d = h - (c_mm + phi_l / 2) / 1000    # [m]
    passos.append({
        "titulo": "6. Cobrimento e altura útil",
        "formula": f"c_nom = {c_mm} mm  |  d = h - c - φ/2 = {h*100:.1f} - {c_mm} - {phi_l//2} mm",
        "resultado": f"d = {d*100:.1f} cm"
    })

    # 7. Dimensionamento da armadura principal
    res_x = _armadura_secao(Mx, 1.0, d, fck, aco)
    rho_min = rho_min_laje(fck, aco)
    As_min  = rho_min * 1.0 * d * 1e4   # m → cm²/m
    As_x    = max(res_x["As_cm2"], As_min)
    passos.append({
        "titulo": "7. Armadura principal (Lx)",
        "formula": (f"kMd = Md/(fcd·b·d²) = {res_x['kMd']:.4f}  |  "
                    f"ξ = {res_x['xi']:.4f}  |  z = {res_x['z_cm']:.2f} cm  |  "
                    f"As = Md/(fyd·z) = {res_x['As_cm2']:.3f} cm²/m"),
        "resultado": (f"As_mín = ρ_mín·b·d = {As_min:.3f} cm²/m  →  "
                      f"Adotar As_x = {As_x:.3f} cm²/m"),
        "aviso": res_x.get("aviso")
    })

    # 8. Armadura secundária
    if bidirecional and My > 0:
        res_y    = _armadura_secao(My, 1.0, d, fck, aco)
        As_y     = max(res_y["As_cm2"], As_min)
        As_dist  = 0.0
    else:
        As_y     = 0.0
        As_dist  = max(0.20 * As_x, As_min * 0.5)
    passos.append({
        "titulo": "8. Armadura secundária / distribuição",
        "formula": ("My → As_y" if bidirecional else "As_dist = 20% × As_x"),
        "resultado": (f"As_y = {As_y:.3f} cm²/m" if bidirecional
                      else f"As_dist = {As_dist:.3f} cm²/m")
    })

    # 9. Seleção de bitolas
    bitola_x = selecionar_bitola(As_x, espacamento_max_cm=20)
    bitola_y = selecionar_bitola(As_y if bidirecional else As_dist, espacamento_max_cm=33)

    # 10. Verificação de esforço cortante (simplificado – normalmente ok para lajes)
    V_d = 0.5 * q_d * lx_m   # kN/m (reação máxima simplesmente apoiada)
    fcd_val = calc_fcd(fck)
    tau_Rd  = 0.25 * fcd_val  # MPa (limite NBR)
    tau_d   = (V_d * 1e3) / (1000 * d * 1000)  # MPa (b=1m, convertendo kN→N, m→mm)
    ok_cortante = tau_d <= tau_Rd

    resultado = {
        "tipo": "Laje Maciça",
        "subtipo": tipo_direcao,
        "h_cm": round(h * 100, 1),
        "d_cm": round(d * 100, 1),
        "PP_kNm2": round(PP, 2),
        "g_total_kNm2": round(g_total, 2),
        "q_d_kNm2": round(q_d, 2),
        "Mx_kNm": round(Mx, 3),
        "My_kNm": round(My, 3),
        "As_x_cm2m": round(As_x, 3),
        "As_y_ou_dist_cm2m": round(As_y if bidirecional else As_dist, 3),
        "bitola_principal": bitola_x,
        "bitola_secundaria": bitola_y,
        "rho_min": rho_min,
        "tau_d_MPa": round(tau_d, 3),
        "tau_Rd_MPa": round(tau_Rd, 3),
        "cortante_ok": ok_cortante,
        "passos": passos,
        "fck": fck,
        "aco": aco,
        "cobrimento_mm": c_mm,
    }
    return resultado


# ---------------------------------------------------------------------------
# Coeficientes de Marcus para laje bidirecional (simplificados)
# ---------------------------------------------------------------------------

_MARCUS_TABLE = {
    # ratio λ=Ly/Lx : (αx, αy)  – apoio simples em 4 bordas
    1.0: (0.0368, 0.0368),
    1.1: (0.0461, 0.0301),
    1.2: (0.0547, 0.0250),
    1.3: (0.0624, 0.0208),
    1.4: (0.0693, 0.0175),
    1.5: (0.0753, 0.0148),
    1.6: (0.0807, 0.0126),
    1.7: (0.0854, 0.0107),
    1.8: (0.0895, 0.0090),
    1.9: (0.0932, 0.0077),
    2.0: (0.0965, 0.0066),
}

def _coeficientes_marcus(ratio: float, tipo_apoio: str) -> tuple:
    """Interpola coeficientes de Marcus para laje bidirecional."""
    r = max(1.0, min(ratio, 2.0))
    keys = sorted(_MARCUS_TABLE.keys())
    if r <= keys[0]:
        ax, ay = _MARCUS_TABLE[keys[0]]
    elif r >= keys[-1]:
        ax, ay = _MARCUS_TABLE[keys[-1]]
    else:
        k0 = max(k for k in keys if k <= r)
        k1 = min(k for k in keys if k >= r)
        if k0 == k1:
            ax, ay = _MARCUS_TABLE[k0]
        else:
            t  = (r - k0) / (k1 - k0)
            ax = _MARCUS_TABLE[k0][0] + t * (_MARCUS_TABLE[k1][0] - _MARCUS_TABLE[k0][0])
            ay = _MARCUS_TABLE[k0][1] + t * (_MARCUS_TABLE[k1][1] - _MARCUS_TABLE[k0][1])
    # Ajuste grosseiro para contínua (reduz ~20%)
    if tipo_apoio == "continua":
        ax *= 0.80
        ay *= 0.80
    return ax, ay


# ===========================================================================
# LAJE TRELIÇADA (pré-moldada)
# ===========================================================================

# Dados típicos de lajes treliçadas comerciais: (h_nervura_cm, h_capa_cm)
TIPOS_TRELICADA = {
    "08+04": {"h_nerv": 0.08, "h_capa": 0.04, "b_nerv": 0.08, "espacamento": 0.40},
    "10+04": {"h_nerv": 0.10, "h_capa": 0.04, "b_nerv": 0.08, "espacamento": 0.40},
    "12+04": {"h_nerv": 0.12, "h_capa": 0.04, "b_nerv": 0.08, "espacamento": 0.50},
    "14+04": {"h_nerv": 0.14, "h_capa": 0.04, "b_nerv": 0.10, "espacamento": 0.50},
    "16+04": {"h_nerv": 0.16, "h_capa": 0.04, "b_nerv": 0.12, "espacamento": 0.50},
    "18+04": {"h_nerv": 0.18, "h_capa": 0.04, "b_nerv": 0.12, "espacamento": 0.60},
    "20+04": {"h_nerv": 0.20, "h_capa": 0.04, "b_nerv": 0.12, "espacamento": 0.60},
}

def calcular_laje_trelicada(
    lx_m: float,
    g_kNm2: float,
    q_kNm2: float,
    fck: float,
    tipo_trelica: str = "12+04",
    aco: str = "CA-50",
    cobrimento_classe: str = "CA-IV",
    tipo_apoio: str = "simples",
    uso: str = "normal",
) -> dict:
    """
    Calcula laje treliçada como seção T equivalente por nervura.
    """
    if tipo_trelica not in TIPOS_TRELICADA:
        raise ValueError(f"Tipo de treliça '{tipo_trelica}' desconhecido.")

    dados = TIPOS_TRELICADA[tipo_trelica]
    h_nerv = dados["h_nerv"]
    h_capa = dados["h_capa"]
    b_nerv = dados["b_nerv"]
    esp    = dados["espacamento"]       # distância entre eixos das nervuras

    h_total = h_nerv + h_capa
    passos  = []

    passos.append({
        "titulo": "1. Geometria da seção",
        "formula": (f"Tipo: {tipo_trelica} cm  |  h_nervura={h_nerv*100:.0f} cm  |  "
                    f"h_capa={h_capa*100:.0f} cm  |  b_nervura={b_nerv*100:.0f} cm  |  "
                    f"espaçamento={esp*100:.0f} cm"),
        "resultado": f"h_total = {h_total*100:.0f} cm"
    })

    # Peso próprio ponderado (nervura + capa)
    vol_por_m2 = b_nerv * h_nerv / esp + h_capa   # m³/m²
    PP = PESOS["concreto_armado"] * vol_por_m2
    g_total = g_kNm2 + PP
    passos.append({
        "titulo": "2. Peso próprio",
        "formula": f"PP = γ_c × V/m² = 25 × {vol_por_m2:.4f} = {PP:.2f} kN/m²",
        "resultado": f"g_total = {g_total:.2f} kN/m²"
    })

    q_d = GAMMA_G_DESF * g_total + GAMMA_Q * q_kNm2
    passos.append({
        "titulo": "3. Ações de cálculo (ELU)",
        "formula": f"q_d = 1.4×{g_total:.2f} + 1.4×{q_kNm2:.2f}",
        "resultado": f"q_d = {q_d:.2f} kN/m²"
    })

    # Carga por nervura
    coef_M  = {"simples": 1/8, "continua": 1/10, "balanco": 1/2}
    cM      = coef_M.get(tipo_apoio, 1/8)
    q_nerv  = q_d * esp            # carga por nervura [kN/m]
    Md_nerv = cM * q_nerv * lx_m ** 2   # momento por nervura [kN.m]
    passos.append({
        "titulo": "4. Momento por nervura",
        "formula": f"q_nerv = {q_d:.2f}×{esp:.2f} = {q_nerv:.2f} kN/m  |  Md = (1/{int(1/cM)})×{q_nerv:.2f}×{lx_m:.2f}²",
        "resultado": f"Md = {Md_nerv:.3f} kN.m/nervura"
    })

    c_mm = COBRIMENTOS[cobrimento_classe]["c_nom"]
    phi_l = 8
    d = h_total - (c_mm + phi_l / 2) / 1000

    res = _armadura_secao(Md_nerv, b_nerv, d, fck, aco)
    rho_min = rho_min_laje(fck, aco)
    As_min  = rho_min * b_nerv * d * 1e4
    As_nerv = max(res["As_cm2"], As_min)
    passos.append({
        "titulo": "5. Armadura por nervura",
        "formula": (f"kMd={res['kMd']:.4f}  ξ={res['xi']:.4f}  z={res['z_cm']:.2f} cm  "
                    f"As_calc={res['As_cm2']:.3f} cm²  As_mín={As_min:.3f} cm²"),
        "resultado": f"Adotar As = {As_nerv:.3f} cm²/nervura",
        "aviso": res.get("aviso")
    })

    # Armadura da capa (malha de distribuição)
    As_capa = max(rho_min * 1.0 * h_capa * 1e4, 0.5)   # cm²/m mínimo 0.5
    passos.append({
        "titulo": "6. Armadura da capa (malha de distribuição)",
        "formula": "As_capa = max(ρ_mín × 1m × h_capa, 0.5 cm²/m)",
        "resultado": f"As_capa = {As_capa:.2f} cm²/m (usar malha eletrossoldada)"
    })

    # Verificação do cortante
    V_nerv  = 0.5 * q_nerv * lx_m   # kN
    fcd_val = calc_fcd(fck)
    tau_Rd  = 0.25 * fcd_val
    tau_d   = (V_nerv * 1e3) / (b_nerv * 1e3 * d * 1e3)   # MPa
    passos.append({
        "titulo": "7. Verificação ao cortante",
        "formula": f"τ_Sd = V/(b_w·d) = {V_nerv:.2f}×10³/({b_nerv*100:.0f}×{d*100:.1f}×10²)",
        "resultado": f"τ_Sd = {tau_d:.3f} MPa  ≤  τ_Rd = {tau_Rd:.3f} MPa  → {'OK' if tau_d<=tau_Rd else 'VERIFICAR'}"
    })

    bitola_nerv = selecionar_bitola(As_nerv, espacamento_max_cm=100)
    bitola_capa = selecionar_bitola(As_capa, espacamento_max_cm=33)

    return {
        "tipo": "Laje Treliçada",
        "subtipo": tipo_trelica,
        "h_total_cm": round(h_total * 100, 1),
        "h_nervura_cm": round(h_nerv * 100, 1),
        "h_capa_cm": round(h_capa * 100, 1),
        "b_nervura_cm": round(b_nerv * 100, 1),
        "espacamento_cm": round(esp * 100, 1),
        "d_cm": round(d * 100, 1),
        "PP_kNm2": round(PP, 2),
        "g_total_kNm2": round(g_total, 2),
        "q_d_kNm2": round(q_d, 2),
        "Md_nerv_kNm": round(Md_nerv, 3),
        "As_nervura_cm2": round(As_nerv, 3),
        "As_capa_cm2m": round(As_capa, 2),
        "bitola_nervura": bitola_nerv,
        "bitola_capa": bitola_capa,
        "tau_d_MPa": round(tau_d, 3),
        "tau_Rd_MPa": round(tau_Rd, 3),
        "cortante_ok": tau_d <= tau_Rd,
        "passos": passos,
        "fck": fck,
        "aco": aco,
    }
