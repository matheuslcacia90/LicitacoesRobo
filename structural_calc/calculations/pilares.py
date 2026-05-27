"""
Cálculo de pilares conforme NBR 6118:2023.
Inclui verificação de esbeltez e excentricidade mínima.
"""
import math
from .normas import (
    fcd as calc_fcd, selecionar_bitola,
    GAMMA_G_DESF, GAMMA_Q, ACOS, PESOS, COBRIMENTOS
)

# Coeficientes de comprimento efetivo (NBR 6118 Tabela 12.1)
BETA_COEFS = {
    "biarticulado":    1.0,
    "um_engaste":      0.7,
    "dois_engastes":   0.5,
    "livre":           2.0,
}


def _esbeltez(le_m: float, b_m: float, h_m: float, forma: str = "retangular") -> dict:
    """Calcula esbeltez do pilar nas duas direções."""
    if forma == "circular":
        r_gir = b_m / 4   # raio de giração = d/4
        lambda_x = le_m / r_gir
        lambda_y = lambda_x
    else:
        Ix = (b_m * h_m ** 3) / 12
        Iy = (h_m * b_m ** 3) / 12
        Ax = b_m * h_m
        rgx = math.sqrt(Ix / Ax)
        rgy = math.sqrt(Iy / Ax)
        lambda_x = le_m / rgx
        lambda_y = le_m / rgy

    return {
        "lambda_x": round(lambda_x, 2),
        "lambda_y": round(lambda_y, 2),
        "lambda_max": round(max(lambda_x, lambda_y), 2),
    }


def calcular_pilar(
    Nd_kN: float,           # força normal de cálculo
    Mx_kNm: float,          # momento de cálculo em x (pode ser 0)
    My_kNm: float,          # momento de cálculo em y (pode ser 0)
    b_m: float,             # largura (menor dimensão)
    h_m: float,             # altura da seção
    l_m: float,             # comprimento do pilar (pé-direito)
    fck: float,
    aco: str   = "CA-50",
    cobrimento_classe: str = "CA-IV",
    condicao_vinculo: str = "biarticulado",
    forma: str = "retangular",   # 'retangular' | 'circular'
) -> dict:
    """
    Dimensionamento de pilar. Retorna armadura, esbeltez e memorial.
    """
    passos = []

    fcd_val = calc_fcd(fck)
    fyd_val = ACOS[aco]["fyd"]
    c_mm    = COBRIMENTOS[cobrimento_classe]["c_nom"]

    # 1. Seção mínima
    dim_min = 0.19   # m
    b = max(b_m, dim_min)
    h = max(h_m, dim_min)
    Ac = b * h if forma != "circular" else math.pi * (b / 2) ** 2   # m²
    passos.append({
        "titulo": "1. Verificação de seção mínima (NBR 6118 ítem 13.2.4)",
        "formula": f"b_mín = h_mín = 19 cm",
        "resultado": f"Seção adotada: {b*100:.1f} × {h*100:.1f} cm  |  Ac = {Ac*1e4:.1f} cm²"
    })

    # 2. Comprimento efetivo
    beta = BETA_COEFS.get(condicao_vinculo, 1.0)
    le   = beta * l_m
    passos.append({
        "titulo": "2. Comprimento efetivo",
        "formula": f"β = {beta}  |  le = β·L = {beta}×{l_m:.2f}",
        "resultado": f"le = {le:.2f} m"
    })

    # 3. Esbeltez
    esb = _esbeltez(le, b, h, forma)
    lam = esb["lambda_max"]
    if lam <= 35:
        classe_esb = "Pilar curto (esbeltez ≤ 35)"
    elif lam <= 90:
        classe_esb = "Pilar médio (35 < esbeltez ≤ 90) – 2ª ordem pelo método approx."
    else:
        classe_esb = "Pilar esbelto (esbeltez > 90) – requer análise rigorosa de 2ª ordem"

    passos.append({
        "titulo": "3. Esbeltez (NBR 6118 ítem 11.5.2)",
        "formula": (f"λx = le/rgx = {esb['lambda_x']:.2f}  |  "
                    f"λy = le/rgy = {esb['lambda_y']:.2f}"),
        "resultado": f"λmax = {lam:.2f}  →  {classe_esb}"
    })

    # 4. Excentricidades mínimas (NBR 6118 ítem 11.8.1)
    e1_min_m = max(l_m / 300, 0.02)   # m (2cm mínimo)
    Md_min_x = Nd_kN * e1_min_m
    Md_min_y = Nd_kN * e1_min_m
    Mx_ef = max(abs(Mx_kNm), Md_min_x)
    My_ef = max(abs(My_kNm), Md_min_y)

    passos.append({
        "titulo": "4. Excentricidade mínima (NBR 6118 ítem 11.8.1)",
        "formula": f"e_mín = max(L/300, 2cm) = max({l_m:.2f}/300, 2) = {e1_min_m*100:.2f} cm",
        "resultado": (f"Md_mín = {Nd_kN:.1f}×{e1_min_m*100:.2f}cm = {Md_min_x:.2f} kN.m  |  "
                      f"Mx_ef={Mx_ef:.2f} kN.m  My_ef={My_ef:.2f} kN.m")
    })

    # 5. Efeitos de 2ª ordem (método γz simplificado para pilar isolado)
    if lam > 35:
        # Método da curvatura aproximada (NBR 6118 A.7)
        phi = max(lam / 300, 0.001)
        Md_add_x = Nd_kN * phi * le
        Md_add_y = Nd_kN * phi * le
        Mx_ef += Md_add_x
        My_ef += Md_add_y
        passos.append({
            "titulo": "5. Efeitos de 2ª ordem (curvatura aproximada)",
            "formula": f"ΔM = Nd·φ·le = {Nd_kN:.1f}×{phi:.4f}×{le:.2f}",
            "resultado": f"ΔMx = ΔMy = {Nd_kN*phi*le:.2f} kN.m adicionados"
        })

    # 6. Dimensionamento da armadura
    # Diagrama N-M simétrico: As' = As (armadura dupla simétrica)
    # Para pilar sujeito a N+M, resolver interação
    phi_lon = 20.0  # mm (estimativa inicial)
    phi_est = 8.0
    d_l = (c_mm + phi_est + phi_lon / 2) / 1000   # m
    d   = h - d_l                                   # altura útil
    ds  = d_l                                        # cobrimento centrado

    # Dimensionamento pelo diagrama de interação (simplificado)
    # Força máxima de compressão pura (sem excentricidade)
    Nmax = 0.8 * (fcd_val * Ac * 1e6 + 0.04 * Ac * 1e6 * fyd_val) / 1e3   # kN (4% max)

    # Equilíbrio (armadura simétrica):
    # Nd = αc·fcd·Ac + 2·As·fyd  (aproximação para excentricidade pequena)
    # Md = As·fyd·(d-ds)
    if Mx_ef > 0 or My_ef > 0:
        Md_total = math.sqrt(Mx_ef ** 2 + My_ef ** 2)   # resultante
        # Iteração simples para pilar com flexo-compressão
        As_flex_cm2 = (Md_total * 1e6) / (fyd_val * (d - ds) * 1e6) * 1e4   # cm²
        As_comp_cm2 = max((Nd_kN * 1e3 - 0.8 * fcd_val * Ac * 1e6) / (2 * fyd_val), 0) / 100  # cm²
        As_total    = max(As_flex_cm2 + As_comp_cm2, 0)
    else:
        As_total = max((Nd_kN * 1e3 - 0.8 * fcd_val * Ac * 1e6) / fyd_val, 0) / 100   # cm²

    # Armadura mínima e máxima (NBR 6118 ítem 17.3.5)
    As_min = 0.004 * Ac * 1e4   # cm² (0,4% Ac)
    As_max = 0.04  * Ac * 1e4   # cm² (4% Ac)
    As_min_abs = 4 * math.pi * (10 / 2) ** 2 / 100  # 4 barras Ø10mm mínimo em cm²

    As_adot = max(As_total, As_min, As_min_abs)
    As_adot = min(As_adot, As_max)

    passos.append({
        "titulo": "6. Dimensionamento da armadura (flexo-compressão)",
        "formula": (f"As_calc = {As_total:.3f} cm²  |  "
                    f"As_mín = {As_min:.3f} cm² (0,4%Ac)  |  "
                    f"As_mín_abs = {As_min_abs:.3f} cm² (4Ø10)"),
        "resultado": f"Adotar As_tot = {As_adot:.3f} cm² distribuídas nas 4 faces"
    })

    # 7. Detalhamento
    # Barras nos cantos + intermediárias
    n_cantos = 4
    As_canto = As_adot / n_cantos
    bitola_lon = selecionar_bitola(As_canto / (b * 100), espacamento_max_cm=100)

    # Estribos (NBR 6118 ítem 18.4)
    phi_lon_adot = bitola_lon["diam"]
    phi_est_mm   = max(5.0, phi_lon_adot / 4)
    phi_est_mm   = min(phi_est_mm, 12.5)
    # Espaçamento máximo de estribos
    s_max_est = min(h * 100, b * 100, phi_lon_adot * 20, 30)   # cm

    passos.append({
        "titulo": "7. Detalhamento dos estribos (NBR 6118 ítem 18.4)",
        "formula": (f"φ_est ≥ max(5mm, φ_lon/4) = {phi_est_mm:.1f} mm  |  "
                    f"s_max = min(b,h,20φ,30cm) = {s_max_est:.1f} cm"),
        "resultado": f"Estribos: φ{phi_est_mm:.1f} c/{s_max_est:.1f} cm"
    })

    # 8. Verificação de capacidade
    As_efetiva = bitola_lon["As_efetivo_cm2m"] * b * 100  # aproximado
    N_rd = (0.8 * fcd_val * Ac * 1e6 + As_adot * 1e-4 * fyd_val * 1e6) / 1e3   # kN
    passos.append({
        "titulo": "8. Capacidade resistente (compressão centrada)",
        "formula": f"N_Rd = 0.8·fcd·Ac + As·fyd = {N_rd:.2f} kN",
        "resultado": f"Nd = {Nd_kN:.2f} kN {'≤' if Nd_kN <= N_rd else '>'} N_Rd = {N_rd:.2f} kN → {'OK' if Nd_kN <= N_rd else 'VERIFICAR'}"
    })

    return {
        "tipo": "Pilar",
        "subtipo": forma,
        "b_cm": round(b * 100, 1),
        "h_cm": round(h * 100, 1),
        "l_m": l_m,
        "le_m": round(le, 2),
        "Nd_kN": Nd_kN,
        "Mx_ef_kNm": round(Mx_ef, 3),
        "My_ef_kNm": round(My_ef, 3),
        "lambda_x": esb["lambda_x"],
        "lambda_y": esb["lambda_y"],
        "lambda_max": lam,
        "classe_esbeltez": classe_esb,
        "As_total_cm2": round(As_adot, 3),
        "As_min_cm2": round(As_min, 3),
        "As_max_cm2": round(As_max, 3),
        "bitola_longitudinal": bitola_lon,
        "phi_estribo_mm": round(phi_est_mm, 1),
        "s_estribo_cm": round(s_max_est, 1),
        "N_rd_kN": round(N_rd, 2),
        "capacidade_ok": Nd_kN <= N_rd,
        "passos": passos,
        "fck": fck,
        "aco": aco,
    }
