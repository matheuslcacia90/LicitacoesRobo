"""
Cálculo de vigas conforme NBR 6118:2023.
Cobre: retangulares e T, simplesmente apoiadas e contínuas.
"""
import math
from .normas import (
    fcd as calc_fcd, rho_min_viga, selecionar_bitola,
    GAMMA_G_DESF, GAMMA_Q, LAMBDA, XI_LIM, ACOS, PESOS, COBRIMENTOS
)


def _altura_minima(l_m: float, tipo_apoio: str) -> float:
    """Altura mínima de viga – NBR 6118 ítem 13.2.3."""
    fatores = {"simples": 1/15, "continua": 1/20, "balanco": 1/8}
    h_vao = l_m * fatores.get(tipo_apoio, 1/15)
    return max(h_vao, 0.30)


def _calcular_As_flex(Md_kNm: float, bw_m: float, d_m: float,
                       fck: float, aco: str) -> dict:
    """Armadura longitudinal de flexão (seção retangular)."""
    fcd_val = calc_fcd(fck)
    fyd_val = ACOS[aco]["fyd"]

    Md_Nmm = Md_kNm * 1e6
    bw_mm  = bw_m * 1e3
    d_mm   = d_m  * 1e3

    kMd = Md_Nmm / (fcd_val * bw_mm * d_mm ** 2)
    disc = 0.64 - 1.28 * kMd
    aviso = None
    if disc < 0:
        aviso = f"kMd={kMd:.4f} > kMd_max (seção insuficiente – aumentar d ou bw)"
        disc = 0.0
        xi = XI_LIM
    else:
        xi = (0.8 - math.sqrt(disc)) / 0.64

    if xi > XI_LIM:
        aviso = f"ξ={xi:.4f} > ξlim={XI_LIM} → dupla armadura ou aumentar seção"
        xi = XI_LIM

    z_mm = d_mm * (1 - 0.4 * xi)
    As_mm2 = Md_Nmm / (fyd_val * z_mm)

    return {
        "kMd": round(kMd, 4),
        "xi":  round(xi, 4),
        "z_cm": round(z_mm / 10, 2),
        "As_cm2": round(As_mm2 / 100, 3),
        "aviso": aviso,
    }


def _dimensionar_cisalhamento(Vd_kN: float, bw_m: float, d_m: float,
                               fck: float, aco: str) -> dict:
    """
    Estribos verticais – Modelo I (bielas a 45°) NBR 6118 ítem 17.4.
    Retorna espaçamento dos estribos e armadura transversal.
    """
    fcd_val = calc_fcd(fck)
    fyd_val = ACOS[aco]["fyd"]
    bw_mm   = bw_m * 1e3
    d_mm    = d_m  * 1e3
    Vd_N    = Vd_kN * 1e3

    # Resistência das bielas (limite máximo de cisalhamento)
    VRd2 = 0.27 * (1 - fck / 250) * fcd_val * bw_mm * d_mm   # N

    # Capacidade mínima do concreto (sem estribos) – NBR eq. 17.31
    tau_Rd = 0.25 * fcd_val
    VRd1 = tau_Rd * bw_mm * d_mm

    aviso = None
    if Vd_N > VRd2:
        aviso = f"Vd={Vd_kN:.2f} kN > VRd2={VRd2/1e3:.2f} kN → aumentar seção"

    # Vswd necessário
    Vswd = max(Vd_N - VRd1, 0)

    # Estribos: Asw/s = Vswd / (fyd * d)
    AsW_s = Vswd / (fyd_val * d_mm)   # mm²/mm = mm

    # Espaçamento máximo (NBR 6118 ítem 17.4.2)
    s_max_mm = min(0.6 * d_mm, 300)

    # Adotar estribo 2 ramos Ø6,3mm → Asw = 2×31.2 = 62.4 mm²
    phi_est = 6.3
    Asw     = 2 * math.pi * (phi_est / 2) ** 2   # mm²

    if AsW_s > 0:
        s_calc = Asw / AsW_s           # mm
        s_adot = min(s_calc, s_max_mm)
    else:
        s_adot = s_max_mm

    s_adot = max(50, round(s_adot / 10) * 10)  # arredonda a 10mm, mín 5cm

    # Armadura mínima de cisalhamento (NBR 17.4.2.2)
    rho_sw_min = 0.2 * math.sqrt(fck) / (fyd_val)   # adimensional
    Asw_min_s  = rho_sw_min * bw_mm                   # mm²/mm

    AsW_efetivo = Asw / s_adot   # mm²/mm

    return {
        "VRd1_kN":  round(VRd1 / 1e3, 2),
        "VRd2_kN":  round(VRd2 / 1e3, 2),
        "phi_estribo_mm": phi_est,
        "n_ramos": 2,
        "Asw_mm2": round(Asw, 2),
        "s_adot_cm": round(s_adot / 10, 1),
        "s_max_cm":  round(s_max_mm / 10, 1),
        "AsW_efetivo_mm2_m": round(AsW_efetivo * 1000, 2),
        "aviso": aviso,
    }


def calcular_viga(
    l_m: float,
    bw_m: float,
    h_m: float,
    g_kNm: float,         # carga permanente distribuída (sem PP)
    q_kNm: float,         # carga variável distribuída
    fck: float,
    aco: str   = "CA-50",
    cobrimento_classe: str = "CA-IV",
    tipo_apoio: str = "simples",
    secao: str  = "retangular",   # 'retangular' | 'T'
    beff_m: float = 0.0,          # largura efetiva da mesa (seção T)
    hf_m: float   = 0.0,          # espessura da mesa (seção T)
) -> dict:
    """Dimensiona viga retangular ou T conforme NBR 6118."""
    passos = []

    # 1. Geometria
    h_min = _altura_minima(l_m, tipo_apoio)
    h = max(h_m, h_min)
    c_mm  = COBRIMENTOS[cobrimento_classe]["c_nom"]
    phi_est = 6.3   # estribo
    phi_lon = 16.0  # barra longitudinal estimada
    d = h - (c_mm + phi_est + phi_lon / 2) / 1000

    passos.append({
        "titulo": "1. Geometria e altura útil",
        "formula": (f"h_mín = L/{15 if tipo_apoio=='simples' else 20 if tipo_apoio=='continua' else 8} = "
                    f"{l_m:.2f}/{15 if tipo_apoio=='simples' else 20 if tipo_apoio=='continua' else 8} = {h_min:.2f} m"),
        "resultado": f"h adotado = {h*100:.1f} cm  |  d = {d*100:.1f} cm"
    })

    # 2. Peso próprio e cargas
    PP = PESOS["concreto_armado"] * bw_m * h   # kN/m
    g_total = g_kNm + PP
    q_d = GAMMA_G_DESF * g_total + GAMMA_Q * q_kNm
    passos.append({
        "titulo": "2. Cargas e combinações (ELU)",
        "formula": f"PP = 25×{bw_m:.2f}×{h:.2f} = {PP:.2f} kN/m  |  q_d = 1.4×{g_total:.2f} + 1.4×{q_kNm:.2f}",
        "resultado": f"q_d = {q_d:.2f} kN/m"
    })

    # 3. Esforços internos
    coef_M = {"simples": 1/8, "continua": 1/10, "balanco": 1/2}
    coef_V = {"simples": 0.5, "continua": 0.6, "balanco": 1.0}
    cM = coef_M.get(tipo_apoio, 1/8)
    cV = coef_V.get(tipo_apoio, 0.5)

    Md  = cM * q_d * l_m ** 2   # kN.m
    Vd  = cV * q_d * l_m        # kN
    passos.append({
        "titulo": "3. Esforços internos máximos",
        "formula": (f"Md = (1/{int(1/cM)})×{q_d:.2f}×{l_m:.2f}² = {Md:.2f} kN.m  |  "
                    f"Vd = {cV:.1f}×{q_d:.2f}×{l_m:.2f} = {Vd:.2f} kN"),
        "resultado": f"Md = {Md:.2f} kN.m  |  Vd = {Vd:.2f} kN"
    })

    # 4. Flexão
    if secao == "T" and beff_m > bw_m and hf_m > 0:
        # Verificar se NA está na mesa
        fcd_val = calc_fcd(fck)
        fyd_val = ACOS[aco]["fyd"]
        d_mm   = d * 1e3
        hf_mm  = hf_m * 1e3
        beff_mm = beff_m * 1e3
        bw_mm  = bw_m * 1e3

        # Força máxima na mesa
        Cf_max = 0.8 * fcd_val * beff_mm * hf_mm   # N
        z_approx = d_mm - hf_mm / 2
        Md_Nmm = Md * 1e6

        if Cf_max * z_approx >= Md_Nmm:
            # NA na mesa → calcular como retangular de largura beff
            res_flex = _calcular_As_flex(Md, beff_m, d, fck, aco)
            secao_real = "T (NA na mesa)"
        else:
            res_flex = _calcular_As_flex(Md, bw_m, d, fck, aco)
            secao_real = "T (NA na nervura)"
    else:
        res_flex  = _calcular_As_flex(Md, bw_m, d, fck, aco)
        secao_real = "retangular"

    rho_min = rho_min_viga(fck, aco)
    As_min  = rho_min * bw_m * d * 1e4   # cm²
    As_lon  = max(res_flex["As_cm2"], As_min)

    passos.append({
        "titulo": f"4. Armadura de flexão ({secao_real})",
        "formula": (f"kMd={res_flex['kMd']:.4f}  ξ={res_flex['xi']:.4f}  "
                    f"z={res_flex['z_cm']:.2f} cm  As_calc={res_flex['As_cm2']:.3f} cm²  "
                    f"As_mín={As_min:.3f} cm²"),
        "resultado": f"Adotar As_lon = {As_lon:.3f} cm²",
        "aviso": res_flex.get("aviso")
    })

    # 5. Cisalhamento
    res_cort = _dimensionar_cisalhamento(Vd, bw_m, d, fck, aco)
    passos.append({
        "titulo": "5. Armadura de cisalhamento (estribos)",
        "formula": (f"VRd1={res_cort['VRd1_kN']:.2f} kN  VRd2={res_cort['VRd2_kN']:.2f} kN  "
                    f"φ{res_cort['phi_estribo_mm']} 2R c/{res_cort['s_adot_cm']:.1f} cm"),
        "resultado": f"Estribos: φ{res_cort['phi_estribo_mm']} 2 ramos c/{res_cort['s_adot_cm']:.1f} cm",
        "aviso": res_cort.get("aviso")
    })

    # 6. Seleção de bitola
    bitola = selecionar_bitola(As_lon, espacamento_max_cm=100)

    return {
        "tipo": "Viga",
        "subtipo": secao_real,
        "l_m": l_m,
        "bw_cm": round(bw_m * 100, 1),
        "h_cm": round(h * 100, 1),
        "d_cm": round(d * 100, 1),
        "PP_kNm": round(PP, 2),
        "g_total_kNm": round(g_total, 2),
        "q_d_kNm": round(q_d, 2),
        "Md_kNm": round(Md, 3),
        "Vd_kN": round(Vd, 3),
        "As_lon_cm2": round(As_lon, 3),
        "bitola_longitudinal": bitola,
        "estribos": res_cort,
        "rho_min": rho_min,
        "passos": passos,
        "fck": fck,
        "aco": aco,
    }
