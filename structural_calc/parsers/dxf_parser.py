"""
Extrator de dimensões de arquivos DXF/DWG.
Usa ezdxf para leitura. DWG deve ser convertido a DXF antes.
"""
import io
from typing import Optional

try:
    import ezdxf
    DXF_DISPONIVEL = True
except ImportError:
    DXF_DISPONIVEL = False


def extrair_dimensoes_dxf(dados_arquivo: bytes, nome_arquivo: str = "") -> dict:
    """
    Extrai entidades e dimensões de um arquivo DXF.
    Retorna dict com listas de linhas, textos e cotas.
    """
    resultado = {
        "nome_arquivo": nome_arquivo,
        "disponivel": DXF_DISPONIVEL,
        "linhas": [],        # comprimentos de linhas [m]
        "cotas": [],         # valores de cotas explícitas [m]
        "textos": [],        # textos encontrados no desenho
        "layers": [],        # layers presentes
        "inserções": [],     # blocos inseridos
        "erro": None,
    }

    if not DXF_DISPONIVEL:
        resultado["erro"] = "ezdxf não instalado"
        return resultado

    try:
        doc = ezdxf.read(io.BytesIO(dados_arquivo))
        msp = doc.modelspace()

        layers_set = set()

        for entity in msp:
            etype = entity.dxftype()
            layer = entity.dxf.layer if hasattr(entity.dxf, "layer") else ""
            layers_set.add(layer)

            if etype == "LINE":
                p1 = entity.dxf.start
                p2 = entity.dxf.end
                comprimento = ((p2.x - p1.x)**2 + (p2.y - p1.y)**2) ** 0.5
                # Assume unidades em mm → converter para m
                c_m = round(comprimento / 1000, 3)
                if 0.05 <= c_m <= 100:
                    resultado["linhas"].append(c_m)

            elif etype in ("TEXT", "MTEXT"):
                texto = ""
                if etype == "TEXT":
                    texto = entity.dxf.text
                elif etype == "MTEXT":
                    texto = entity.text
                if texto:
                    resultado["textos"].append(texto[:200])

            elif etype in ("DIMENSION", "ALIGNED_DIM", "LINEAR_DIM"):
                try:
                    val = entity.dxf.get("actual_measurement", 0)
                    if val and val > 0:
                        resultado["cotas"].append(round(val / 1000, 3))
                except Exception:
                    pass

            elif etype == "INSERT":
                nome_bloco = entity.dxf.name
                resultado["inserções"].append(nome_bloco)

        resultado["layers"] = sorted(layers_set)

        # Deduplica
        resultado["linhas"] = sorted(set(resultado["linhas"]))
        resultado["cotas"]  = sorted(set(resultado["cotas"]))

    except Exception as e:
        resultado["erro"] = str(e)

    return resultado


def extrair_dimensoes_ifc(dados_arquivo: bytes, nome_arquivo: str = "") -> dict:
    """
    Extrai elementos estruturais de arquivo IFC.
    Usa ifcopenshell se disponível; caso contrário, parsing básico.
    """
    resultado = {
        "nome_arquivo": nome_arquivo,
        "elementos": [],
        "erro": None,
    }

    try:
        import ifcopenshell
        import ifcopenshell.util.element as ifc_util

        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as f:
            f.write(dados_arquivo)
            tmp_path = f.name

        try:
            ifc_model = ifcopenshell.open(tmp_path)
            for elem in ifc_model.by_type("IfcBuildingElement"):
                info = {
                    "tipo": elem.is_a(),
                    "nome": getattr(elem, "Name", None),
                    "guid": getattr(elem, "GlobalId", None),
                }
                resultado["elementos"].append(info)
        finally:
            os.unlink(tmp_path)

    except ImportError:
        # Parsing básico por texto
        try:
            texto = dados_arquivo.decode("utf-8", errors="ignore")
            import re
            for match in re.finditer(r"IFC(\w+)\((.*?)\);", texto[:20000]):
                tipo = "Ifc" + match.group(1)
                if any(t in tipo for t in ["Beam", "Column", "Slab", "Wall", "Footing", "Pile"]):
                    resultado["elementos"].append({"tipo": tipo, "nome": None, "guid": None})
        except Exception as e:
            resultado["erro"] = str(e)

    except Exception as e:
        resultado["erro"] = str(e)

    return resultado
