"""
Cálculo de muro de arrimo (gravidade e em balanço) conforme NBR 6118 / 6122.
Teoria de Rankine para empuxo de terra.
"""
import math
from .normas import (
    fcd as calc_fcd, selecionar_bitola,
    GAMMA_G_DESF, GAMMA_Q, ACOS, PESOS, COBRIMENTOS
)


def _ka_rankine(phi_graus: float) -> float:
    """Coeficiente de empuxo ativo de Rankine (solo seco, β=0)."""
    phi = math.radians(phi_graus)
    return (1 - math.sin(phi)) / (1 + math.sin(phi))


def calcular_muro_arrimo(
    H_m: float,             # altura de aterro (acima da base)
    phi_graus: float = 30,  # ângulo de atrito interno do solo
    gamma_solo: float = 18, # peso específico do solo [kN/m³]
    q_sobrecarga: float = 0, # sobrecarga no topo [kN/m²]
    tipo: str = "balanco",   # 'balanco' | 'gravidade'
    fck: float = 25.0,
    aco: str   = "CA-50",
    cobrimento_classe: str = "CA-II",
    sigma_adm_solo: float = 150,   # kN/m²
) -> dict:
    """
    Dimensiona muro de arrimo.
    Muro em balanço (tela + sapata) – seção de unidade de comprimento (1 m).
    """
    passos = []

    Ka = _ka_rankine(phi_graus)
    passos.append({
        "titulo": "1. Coeficiente de empuxo ativo (Rankine)",
        "formula": f"Ka = (1-sinφ)/(1+sinφ) = (1-sin{phi_graus}°)/(1+sin{phi_graus}°)",
        "resultado": f"Ka = {Ka:.4f}"
    })

    # Empuxo horizontal total (por metro linear)
    Ea_q = Ka * q_sobrecarga * H_m              # kN/m (contribuição da sobrecarga)
    Ea_solo = 0.5 * Ka * gamma_solo * H_m ** 2  # kN/m (triângulo)
    Ea = Ea_solo + Ea_q
    passos.append({
        "titulo": "2. Empuxo ativo total",
        "formula": (f"Ea_solo = ½·Ka·γ·H² = ½×{Ka:.4f}×{gamma_solo}×{H_m:.2f}² = {Ea_solo:.2f} kN/m  |  "
                    f"Ea_q = Ka·q·H = {Ka:.4f}×{q_sobrecarga}×{H_m:.2f} = {Ea_q:.2f} kN/m"),
        "resultado": f"Ea = {Ea:.2f} kN/m"
    })

    # Ponto de aplicação de Ea acima da base
    if Ea > 0:
        y_ea = (Ea_solo * H_m / 3 + Ea_q * H_m / 2) / Ea
    else:
        y_ea = H_m / 3
    passos.append({
        "titulo": "3. Ponto de aplicação de Ea",
        "formula": f"ȳ = (Ea_solo·H/3 + Ea_q·H/2) / Ea",
        "resultado": f"ȳ = {y_ea:.2f} m acima da base"
    })

    if tipo == "balanco":
        # -----------------------------------------------------------------------
        # Muro em balanço: tela vertical + sapata
        # -----------------------------------------------------------------------
        # Espessura da tela (estimativa inicial)
        t_tela = max(H_m / 12, 0.20)
        t_tela = math.ceil(t_tela / 0.05) * 0.05

        # Sapata
        l_sap_total = max(H_m * 0.6, 1.5)
        l_talon     = l_sap_total * 0.6    # parte posterior (talão)
        l_bico      = l_sap_total - l_talon - t_tela
        h_sap       = max(H_m / 12, 0.30)
        h_sap       = math.ceil(h_sap / 0.05) * 0.05

        passos.append({
            "titulo": "4. Geometria do muro em balanço",
            "formula": (f"t_tela = H/12 = {H_m:.2f}/12 = {t_tela*100:.0f} cm  |  "
                        f"L_sap = 0.6H = {l_sap_total:.2f} m  |  h_sap ≥ {h_sap*100:.0f} cm"),
            "resultado": f"Tela: {t_tela*100:.0f} cm  Sapata: {l_sap_total:.2f}m × {h_sap*100:.0f}cm"
        })

        # Peso do muro (por metro)
        W_tela = PESOS["concreto_armado"] * t_tela * H_m          # kN/m
        W_sap  = PESOS["concreto_armado"] * l_sap_total * h_sap   # kN/m
        W_solo = gamma_solo * l_talon * H_m                        # kN/m (solo sobre talão)
        W_q    = q_sobrecarga * l_talon                            # kN/m
        W_total = W_tela + W_sap + W_solo + W_q

        # Braço (em relação ao bico da sapata)
        x_tela = l_bico + t_tela / 2
        x_sap  = l_sap_total / 2
        x_solo = l_bico + t_tela + l_talon / 2
        x_q    = x_solo

        M_resist = W_tela * x_tela + W_sap * x_sap + W_solo * x_solo + W_q * x_q
        M_derrub = Ea * y_ea   # momento derrubador em relação ao bico

        FS_derrub = M_resist / M_derrub

        passos.append({
            "titulo": "5. Verificação ao tombamento",
            "formula": (f"M_resist = {M_resist:.2f} kN.m/m  |  M_derrub = Ea·ȳ = {Ea:.2f}×{y_ea:.2f} = {M_derrub:.2f} kN.m/m"),
            "resultado": f"FS_tombamento = {FS_derrub:.2f}  {'≥' if FS_derrub>=1.5 else '<'} 1,5 → {'OK' if FS_derrub>=1.5 else 'INSUFICIENTE'}"
        })

        # Deslizamento
        delta = phi_graus * 2 / 3   # ângulo de atrito base (δ ≈ 2/3·φ)
        Fresist = W_total * math.tan(math.radians(delta))
        FS_desl = Fresist / Ea

        passos.append({
            "titulo": "6. Verificação ao deslizamento",
            "formula": (f"F_resist = W·tan(δ) = {W_total:.2f}×tan({delta:.1f}°) = {Fresist:.2f} kN/m"),
            "resultado": f"FS_desliz = {FS_desl:.2f}  {'≥' if FS_desl>=1.5 else '<'} 1,5 → {'OK' if FS_desl>=1.5 else 'INSUFICIENTE'}"
        })

        # Tensões no solo
        e_result = (M_resist - M_derrub) / W_total   # excentricidade em relação ao centro
        e = abs(l_sap_total / 2 - e_result)
        sigma_max = (W_total / l_sap_total) * (1 + 6 * e / l_sap_total)
        sigma_min = (W_total / l_sap_total) * (1 - 6 * e / l_sap_total)

        passos.append({
            "titulo": "7. Tensões no solo (fundação)",
            "formula": f"σmax = (W/L)·(1 + 6e/L)  |  e = {e:.3f} m",
            "resultado": (f"σmax = {sigma_max:.1f} kN/m²  |  σmin = {sigma_min:.1f} kN/m²  |  "
                          f"σadm = {sigma_adm_solo:.0f} kN/m² → {'OK' if sigma_max<=sigma_adm_solo else 'VERIFICAR'}")
        })

        # Armadura da tela (balanço)
        c_mm = COBRIMENTOS[cobrimento_classe]["c_nom"]
        d_tela = t_tela - (c_mm + 8) / 1000
        Md_tela = Ea * y_ea   # kN.m/m (momento no encastramento)

        fcd_val = calc_fcd(fck)
        fyd_val = ACOS[aco]["fyd"]
        Md_Nmm  = Md_tela * 1e6
        bw_mm   = 1000.0
        d_mm    = d_tela * 1e3

        kMd = Md_Nmm / (fcd_val * bw_mm * d_mm ** 2)
        disc = 0.64 - 1.28 * kMd
        xi   = (0.8 - math.sqrt(max(disc, 0))) / 0.64
        z_mm = d_mm * (1 - 0.4 * xi)
        As_mm2 = Md_Nmm / (fyd_val * z_mm)
        As_tela = max(As_mm2 / 100, 0.0015 * bw_mm * d_mm / 100)   # cm²/m

        passos.append({
            "titulo": "8. Armadura da tela (balanço)",
            "formula": f"Md = {Md_tela:.3f} kN.m/m  kMd={kMd:.4f}  As_calc={As_mm2/100:.3f} cm²/m",
            "resultado": f"As_tela = {As_tela:.3f} cm²/m  (face tracionada: lado do aterro)"
        })

        bitola_tela = selecionar_bitola(As_tela, espacamento_max_cm=20)

        return {
            "tipo": "Muro de Arrimo",
            "subtipo": "Em balanço",
            "H_m": H_m,
            "Ka": round(Ka, 4),
            "Ea_kNm": round(Ea, 3),
            "y_ea_m": round(y_ea, 3),
            "t_tela_cm": round(t_tela * 100, 1),
            "l_sapata_m": round(l_sap_total, 2),
            "h_sapata_cm": round(h_sap * 100, 1),
            "FS_tombamento": round(FS_derrub, 2),
            "FS_deslizamento": round(FS_desl, 2),
            "sigma_max_kNm2": round(sigma_max, 2),
            "sigma_min_kNm2": round(sigma_min, 2),
            "sigma_adm_ok": sigma_max <= sigma_adm_solo,
            "As_tela_cm2m": round(As_tela, 3),
            "bitola_tela": bitola_tela,
            "tombamento_ok": FS_derrub >= 1.5,
            "deslizamento_ok": FS_desl >= 1.5,
            "passos": passos,
            "fck": fck,
            "aco": aco,
        }

    else:
        # Muro de gravidade (concreto simples ou ciclópico)
        base = max(H_m * 0.5, 1.0)
        topo_m = max(H_m * 0.2, 0.40)

        W_muro = 0.5 * (base + topo_m) * H_m * PESOS["concreto_simples"]
        xw = (base ** 2 + base * topo_m + topo_m ** 2) / (3 * (base + topo_m))
        M_resist = W_muro * (base - xw)
        M_derrub = Ea * y_ea
        FS_derrub = M_resist / M_derrub if M_derrub > 0 else 999

        delta = phi_graus / 2
        FS_desl = (W_muro * math.tan(math.radians(delta))) / Ea if Ea > 0 else 999

        return {
            "tipo": "Muro de Arrimo",
            "subtipo": "Gravidade",
            "H_m": H_m,
            "Ka": round(Ka, 4),
            "Ea_kNm": round(Ea, 3),
            "base_m": round(base, 2),
            "topo_m": round(topo_m, 2),
            "FS_tombamento": round(FS_derrub, 2),
            "FS_deslizamento": round(FS_desl, 2),
            "tombamento_ok": FS_derrub >= 1.5,
            "deslizamento_ok": FS_desl >= 1.5,
            "passos": passos,
            "observacao": "Muro de gravidade: sem armadura (concreto simples ou ciclópico)"
        }
