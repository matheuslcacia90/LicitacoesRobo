"""
Cálculo de alvenaria estrutural conforme NBR 15961-1:2011 e NBR 6118.
Blocos: cerâmico, concreto.
"""
import math
from .normas import PESOS


# ---------------------------------------------------------------------------
# Blocos disponíveis (resistência característica do prisma)
# ---------------------------------------------------------------------------

BLOCOS = {
    "ceramico_4MPa":   {"material": "Cerâmico", "fbk": 4.0,  "nome": "Cerâmico 4 MPa"},
    "ceramico_6MPa":   {"material": "Cerâmico", "fbk": 6.0,  "nome": "Cerâmico 6 MPa"},
    "ceramico_8MPa":   {"material": "Cerâmico", "fbk": 8.0,  "nome": "Cerâmico 8 MPa"},
    "concreto_4MPa":   {"material": "Concreto", "fbk": 4.0,  "nome": "Concreto 4 MPa"},
    "concreto_6MPa":   {"material": "Concreto", "fbk": 6.0,  "nome": "Concreto 6 MPa"},
    "concreto_8MPa":   {"material": "Concreto", "fbk": 8.0,  "nome": "Concreto 8 MPa"},
    "concreto_12MPa":  {"material": "Concreto", "fbk": 12.0, "nome": "Concreto 12 MPa"},
}

# Módulo de elasticidade (NBR 15961-1 ítem 9.3)
def Es_alv(fbk: float) -> float:
    """Módulo de elasticidade secante da alvenaria [MPa]."""
    return 600 * fbk   # simplificado

# Coeficiente de ponderação
GAMMA_M = 2.0   # alvenaria sem controle específico
GAMMA_M_CTRL = 1.4   # com controle rigoroso na obra


def calcular_alvenaria_estrutural(
    Nd_kN_m: float,          # carga normal de cálculo por metro de parede
    h_parede_m: float,       # altura livre da parede
    e_parede_m: float = 0.14, # espessura da parede (bloco + argamassa)
    tipo_bloco: str = "concreto_6MPa",
    vinculo: str = "engastado_topo",   # 'engastado_topo' | 'biarticulado' | 'livre'
    controle: str = "normal",          # 'normal' | 'rigoroso'
) -> dict:
    """
    Verifica parede de alvenaria estrutural à compressão simples.
    NBR 15961-1 Seção 10.
    """
    passos = []

    bloco = BLOCOS.get(tipo_bloco, BLOCOS["concreto_6MPa"])
    fbk   = bloco["fbk"]
    gm    = GAMMA_M_CTRL if controle == "rigoroso" else GAMMA_M
    fd    = fbk / gm   # resistência de cálculo [MPa]

    passos.append({
        "titulo": "1. Resistência de cálculo dos blocos",
        "formula": f"fd = fbk/γm = {fbk:.1f}/{gm:.1f}",
        "resultado": f"fd = {fd:.3f} MPa"
    })

    # Esbeltez efetiva
    beta_vinc = {"engastado_topo": 0.75, "biarticulado": 1.0, "livre": 2.0}
    beta = beta_vinc.get(vinculo, 0.75)
    he   = beta * h_parede_m   # altura efetiva
    lam  = he / e_parede_m     # esbeltez

    passos.append({
        "titulo": "2. Esbeltez (NBR 15961-1 ítem 10.4)",
        "formula": f"λ = he/e = ({beta}×{h_parede_m:.2f})/{e_parede_m:.2f}",
        "resultado": f"λ = {lam:.2f}  (limite: ≤ 30)"
    })

    if lam > 30:
        aviso_esb = f"Esbeltez λ={lam:.1f} > 30 → aumentar espessura ou reduzir altura"
    else:
        aviso_esb = None

    # Fator de redução por esbeltez (NBR 15961-1 eq. 38)
    if lam <= 6:
        phi = 1.0
    else:
        phi = max(1.0 - (lam / 80) ** 2, 0.5)

    passos.append({
        "titulo": "3. Fator de redução por esbeltez (φ)",
        "formula": f"φ = 1 - (λ/80)² = 1 - ({lam:.2f}/80)²",
        "resultado": f"φ = {phi:.4f}",
        "aviso": aviso_esb
    })

    # Área bruta por metro (espessura × 1m)
    A_m2_m = e_parede_m * 1.0   # m²/m

    # Capacidade resistente
    N_Rd = phi * fd * A_m2_m * 1e3   # kN/m (fd em MPa, A em m²/m → kN/m)

    passos.append({
        "titulo": "4. Capacidade resistente",
        "formula": f"N_Rd = φ·fd·A = {phi:.4f}×{fd:.3f}MPa×{e_parede_m*100:.0f}cm×1m",
        "resultado": f"N_Rd = {N_Rd:.2f} kN/m"
    })

    ok = Nd_kN_m <= N_Rd

    passos.append({
        "titulo": "5. Verificação",
        "formula": f"Nd = {Nd_kN_m:.2f} kN/m  ≤?  N_Rd = {N_Rd:.2f} kN/m",
        "resultado": f"→ {'APROVADO' if ok else 'REPROVADO – aumentar resistência do bloco ou espessura'}"
    })

    # Recomendação de bloco (se reprovado)
    recomendacao = None
    if not ok:
        fd_min = Nd_kN_m / (phi * A_m2_m * 1e3)
        fbk_min = fd_min * gm
        cands = {k: v for k, v in BLOCOS.items() if v["fbk"] >= fbk_min and v["material"] == bloco["material"]}
        if cands:
            k_rec = min(cands, key=lambda k: BLOCOS[k]["fbk"])
            recomendacao = f"Usar {BLOCOS[k_rec]['nome']}"

    # Armadura horizontal de graute (se estrutura armada)
    # Verificação simplificada
    q_lat_kNm = 0.0   # sem ação lateral (simplificação)
    As_horiz = 0.0015 * e_parede_m * 1.0 * 1e4   # cm²/m (taxa mínima)

    passos.append({
        "titulo": "6. Armadura horizontal mínima (se alvenaria armada)",
        "formula": "As_mín = 0,15% × e × 1m",
        "resultado": f"As_h_mín = {As_horiz:.2f} cm²/m  (graute a cada 60 cm recomendado)"
    })

    return {
        "tipo": "Alvenaria Estrutural",
        "subtipo": bloco["nome"],
        "fbk_MPa": fbk,
        "fd_MPa": round(fd, 4),
        "gm": gm,
        "lambda": round(lam, 2),
        "phi": round(phi, 4),
        "N_Rd_kNm": round(N_Rd, 2),
        "Nd_kNm": Nd_kN_m,
        "aprovado": ok,
        "recomendacao": recomendacao,
        "As_h_min_cm2m": round(As_horiz, 3),
        "aviso_esbeltez": aviso_esb,
        "passos": passos,
    }
