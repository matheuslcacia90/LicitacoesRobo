"""
Pipeline de cálculo automático de elementos estruturais.
"""
from ..calculations import (
    calcular_laje_macica, calcular_laje_trelicada,
    calcular_viga, calcular_pilar,
    calcular_sapata_isolada, calcular_viga_baldrame, calcular_estaca,
    calcular_muro_arrimo, calcular_alvenaria_estrutural,
)
from ..models import Calculo
from .recognizer import reconhecer_elementos


def calcular_elemento(elem: dict) -> dict:
    """Executa a função de cálculo adequada para o elemento reconhecido."""
    tipo = elem.get('tipo')

    try:
        if tipo == 'laje':
            if elem.get('subtipo') == 'trelicada':
                return calcular_laje_trelicada(
                    lx_m=float(elem['lx']),
                    g_kNm2=float(elem['g']),
                    q_kNm2=float(elem['q']),
                    fck=int(elem['fck']),
                    tipo_trelica=elem.get('tipo_trelica', '12+04'),
                    aco=elem.get('aco', 'CA-50'),
                    cobrimento_classe=elem.get('cobrimento', 'CA-IV'),
                )
            else:
                return calcular_laje_macica(
                    lx_m=float(elem['lx']),
                    ly_m=float(elem['ly']),
                    g_kNm2=float(elem['g']),
                    q_kNm2=float(elem['q']),
                    fck=int(elem['fck']),
                    aco=elem.get('aco', 'CA-50'),
                    cobrimento_classe=elem.get('cobrimento', 'CA-IV'),
                    tipo_apoio=elem.get('apoio', 'simples'),
                    uso=elem.get('uso', 'residencial'),
                )

        elif tipo == 'viga':
            bw = float(elem.get('bw_cm', 20))
            h  = float(elem.get('h_cm',  50))
            if bw > 2: bw = bw / 100
            if h  > 2: h  = h  / 100
            return calcular_viga(
                l_m=float(elem['l']),
                bw_m=bw, h_m=h,
                g_kNm=float(elem['g']),
                q_kNm=float(elem['q']),
                fck=int(elem['fck']),
                aco=elem.get('aco', 'CA-50'),
                cobrimento_classe=elem.get('cobrimento', 'CA-IV'),
                tipo_apoio=elem.get('apoio', 'simples'),
                secao=elem.get('secao', 'retangular'),
            )

        elif tipo == 'pilar':
            b = float(elem.get('b_cm', 20))
            h = float(elem.get('h_cm', 30))
            if b > 2: b = b / 100
            if h > 2: h = h / 100
            return calcular_pilar(
                Nd_kN=float(elem['Nd']),
                Mx_kNm=float(elem.get('Mx', 0)),
                My_kNm=float(elem.get('My', 0)),
                b_m=b, h_m=h,
                l_m=float(elem.get('l', 3.0)),
                fck=int(elem['fck']),
                aco=elem.get('aco', 'CA-50'),
                cobrimento_classe=elem.get('cobrimento', 'CA-IV'),
                condicao_vinculo=elem.get('vinculo', 'biarticulado'),
                forma=elem.get('forma', 'retangular'),
            )

        elif tipo == 'fundacao':
            sub = elem.get('subtipo', 'sapata_isolada')
            if sub == 'sapata_isolada':
                b = float(elem.get('b_pilar_cm', 20))
                h = float(elem.get('h_pilar_cm', 30))
                if b > 2: b = b / 100
                if h > 2: h = h / 100
                return calcular_sapata_isolada(
                    Nd_kN=float(elem['Nd']),
                    Nk_kN=float(elem.get('Nk', elem['Nd'] * 0.72)),
                    b_pilar_m=b, h_pilar_m=h,
                    n_spt=int(elem.get('nspt', 10)),
                    tipo_solo=elem.get('solo', 'areia'),
                    fck=int(elem.get('fck', 25)),
                    aco=elem.get('aco', 'CA-50'),
                    cobrimento_classe=elem.get('cobrimento', 'CA-III'),
                )
            elif sub == 'viga_baldrame':
                return calcular_viga_baldrame(
                    q_kNm=float(elem['q']),
                    l_m=float(elem['l']),
                    n_spt=int(elem.get('nspt', 10)),
                    tipo_solo=elem.get('solo', 'areia'),
                    fck=int(elem.get('fck', 25)),
                    aco=elem.get('aco', 'CA-50'),
                    cobrimento_classe=elem.get('cobrimento', 'CA-III'),
                )
            elif sub == 'estaca':
                d = float(elem.get('d_estaca_cm', 35))
                if d > 2: d = d / 100
                return calcular_estaca(
                    Nk_kN=float(elem.get('Nk', 100)),
                    Nd_kN=float(elem.get('Nd', 140)),
                    n_spt_ponta=int(elem.get('nspt_ponta', 15)),
                    n_spt_fuste=float(elem.get('nspt_fuste', 8)),
                    h_estaca_m=float(elem.get('h_estaca', 10)),
                    d_estaca_m=d,
                    tipo_estaca=elem.get('tipo_estaca', 'concreto_moldada_local'),
                )

        elif tipo == 'muro':
            return calcular_muro_arrimo(
                H_m=float(elem['H']),
                phi_graus=float(elem.get('phi', 30)),
                gamma_solo=float(elem.get('gamma_solo', 18)),
                q_sobrecarga=float(elem.get('q_sob', 0)),
                tipo=elem.get('tipo_muro', 'balanco'),
                fck=int(elem.get('fck', 25)),
                aco=elem.get('aco', 'CA-50'),
                cobrimento_classe=elem.get('cobrimento', 'CA-II'),
                sigma_adm_solo=float(elem.get('sigma_adm', 150)),
            )

        elif tipo == 'alvenaria':
            e = float(elem.get('e_cm', 14))
            if e > 2: e = e / 100
            return calcular_alvenaria_estrutural(
                Nd_kN_m=float(elem['Nd']),
                h_parede_m=float(elem.get('h', 3.0)),
                e_parede_m=e,
                tipo_bloco=elem.get('bloco', 'concreto_6MPa'),
                vinculo=elem.get('vinculo', 'engastado_topo'),
                controle=elem.get('controle', 'normal'),
            )

    except Exception as e:
        return {'_erro_calculo': str(e)}

    return {}


def _status_ok(resultado: dict) -> bool:
    """Verifica se o resultado está aprovado."""
    checks = ['aprovado', 'capacidade_ok', 'tombamento_ok', 'deslizamento_ok']
    for k in checks:
        if k in resultado and resultado[k] is False:
            return False
    return True


def _deduplicar(elementos: list) -> list:
    """Remove elementos muito similares."""
    seen, result = [], []
    for e in elementos:
        key = (
            e.get('tipo'),
            e.get('subtipo', ''),
            round(float(e.get('lx', e.get('l', e.get('Nd', e.get('H', 0))))), 0),
        )
        if key not in seen:
            seen.append(key)
            result.append(e)
    return result


def _elementos_tipicos_residencial() -> list:
    """Conjunto de elementos típicos para análise sem arquivos."""
    return [
        {
            'tipo': 'laje', 'subtipo': 'macica',
            'lx': 4.0, 'ly': 5.0, 'g': 1.5, 'q': 1.5,
            'fck': 25, 'aco': 'CA-50', 'cobrimento': 'CA-IV',
            'apoio': 'simples', 'uso': 'residencial', 'tipo_trelica': '12+04',
            'descricao': 'Laje maciça típica residencial 4×5m',
            'confianca': 'baixa',
            'suposicoes': ['Dimensões padrão 4×5m', 'Uso residencial NBR 6120', 'Apoio simples'],
        },
        {
            'tipo': 'viga', 'l': 5.0, 'bw_cm': 20, 'h_cm': 50,
            'g': 5.0, 'q': 3.0, 'fck': 25, 'aco': 'CA-50',
            'cobrimento': 'CA-IV', 'apoio': 'simples', 'secao': 'retangular',
            'descricao': 'Viga 20×50cm L=5m',
            'confianca': 'baixa',
            'suposicoes': ['Seção 20×50cm (mín. NBR)', 'Vão 5m', 'Cargas típicas'],
        },
        {
            'tipo': 'pilar', 'Nd': 500, 'Mx': 0, 'My': 0,
            'b_cm': 20, 'h_cm': 30, 'l': 3.0,
            'fck': 25, 'aco': 'CA-50', 'cobrimento': 'CA-IV',
            'vinculo': 'biarticulado', 'forma': 'retangular',
            'descricao': 'Pilar 20×30cm Nd=500kN',
            'confianca': 'baixa',
            'suposicoes': ['Nd=500 kN estimado', 'Seção mínima NBR 6118'],
        },
        {
            'tipo': 'fundacao', 'subtipo': 'sapata_isolada',
            'Nd': 500, 'Nk': 360, 'b_pilar_cm': 20, 'h_pilar_cm': 30,
            'nspt': 10, 'solo': 'areia', 'fck': 25, 'aco': 'CA-50',
            'cobrimento': 'CA-III',
            'descricao': 'Sapata isolada SPT=10 Nd=500kN',
            'confianca': 'baixa',
            'suposicoes': ['SPT=10 (solo médio)', 'Solo: areia', 'Nk estimado como 0,72×Nd'],
        },
    ]


def analisar_e_calcular(projeto_id: int, arquivos: list, db_session) -> dict:
    """
    Pipeline principal: reconhece elementos, calcula, salva no banco.

    Parâmetros
    ----------
    projeto_id : int
    arquivos : list of {'nome_original': str, 'dados_texto': str}
    db_session : SQLAlchemy session

    Retorna
    -------
    dict com 'elementos', 'total', 'erros'
    """
    todos_elementos = []
    erros = []

    # 1. Reconhecer elementos de cada arquivo
    for arq in arquivos:
        texto = arq.get('dados_texto', '') or ''
        nome = arq.get('nome_original', '')
        if not texto.strip():
            continue
        try:
            elementos = reconhecer_elementos(texto, nome)
            todos_elementos.extend(elementos)
        except Exception as exc:
            erros.append(f"Reconhecimento em '{nome}': {exc}")

    # 2. Se nenhum elemento encontrado, usar típicos residenciais
    sem_arquivos = not todos_elementos
    if sem_arquivos:
        todos_elementos = _elementos_tipicos_residencial()
        erros.append(
            "Nenhum elemento identificado nos arquivos — usando elementos típicos residenciais como base."
        )

    # 3. Deduplicar
    todos_elementos = _deduplicar(todos_elementos)

    # 4. Calcular e salvar
    resultados = []
    for elem in todos_elementos:
        resultado = calcular_elemento(elem)
        if not resultado:
            erros.append(f"Resultado vazio para {elem.get('descricao', elem.get('tipo'))}")
            continue

        erro_calc = resultado.pop('_erro_calculo', None)
        if erro_calc:
            erros.append(f"Erro ao calcular {elem.get('descricao', elem.get('tipo'))}: {erro_calc}")
            continue

        # Salvar no banco
        try:
            calc = Calculo(
                projeto_id=projeto_id,
                elemento_tipo=elem['tipo'],
                descricao=elem.get('descricao', elem['tipo']),
                parametros=elem,
                resultado=resultado,
            )
            db_session.add(calc)
            db_session.flush()
            calc_id = calc.id
        except Exception as exc:
            db_session.rollback()
            erros.append(f"Salvar {elem.get('descricao')}: {exc}")
            calc_id = None

        resultados.append({
            'calculo_id': calc_id,
            'descricao': elem.get('descricao', elem['tipo']),
            'tipo': elem['tipo'],
            'subtipo': elem.get('subtipo', ''),
            'confianca': elem.get('confianca', 'media'),
            'suposicoes': elem.get('suposicoes', []),
            'arquivo_origem': elem.get('arquivo_origem', ''),
            'status_ok': _status_ok(resultado),
            'resumo': _resumo_resultado(elem['tipo'], resultado),
        })

    try:
        db_session.commit()
    except Exception as exc:
        db_session.rollback()
        erros.append(f"Commit final: {exc}")

    return {
        'elementos': resultados,
        'total': len(resultados),
        'erros': erros,
        'usou_tipicos': sem_arquivos,
    }


def _resumo_resultado(tipo: str, r: dict) -> dict:
    """Extrai os campos mais importantes do resultado para exibição no card."""
    if tipo == 'laje':
        return {
            'h': r.get('h_cm') or r.get('h_total_cm'),
            'As_x': r.get('As_x_cm2m') or r.get('As_nervura_cm2'),
            'label_as': 'As-x (cm²/m)',
        }
    elif tipo == 'viga':
        return {
            'As': r.get('As_lon_cm2'),
            'Vd': r.get('Vd_kN'),
            'label_as': 'As long. (cm²)',
        }
    elif tipo == 'pilar':
        return {
            'As': r.get('As_total_cm2'),
            'N_rd': r.get('N_rd_kN'),
            'label_as': 'As total (cm²)',
        }
    elif tipo == 'fundacao':
        return {
            'lado': r.get('lado_m') or r.get('b_corrida_cm'),
            'As': r.get('As_cm2_m') or r.get('As_lon_cm2'),
            'n_estacas': r.get('n_estacas'),
            'label_as': 'As (cm²/m)',
        }
    elif tipo == 'muro':
        return {
            'FS_t': r.get('FS_tombamento'),
            'FS_d': r.get('FS_deslizamento'),
            'As': r.get('As_tela_cm2m'),
            'label_as': 'As tela (cm²/m)',
        }
    elif tipo == 'alvenaria':
        return {
            'N_rd': r.get('N_Rd_kNm'),
            'phi': r.get('phi'),
            'label_as': 'N_Rd (kN/m)',
        }
    return {}
