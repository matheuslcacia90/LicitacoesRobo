"""
Extrator de dimensões de arquivos PDF.
Usa pdfplumber para extrair texto e regex para detectar dimensões.
"""
import re
import io
from typing import Optional

try:
    import pdfplumber
    PDF_DISPONIVEL = True
except ImportError:
    PDF_DISPONIVEL = False


# Padrões para detectar dimensões em plantas (metros e centímetros)
_PAD_M  = re.compile(r"\b(\d+[.,]\d+)\s*m\b",  re.IGNORECASE)
_PAD_CM = re.compile(r"\b(\d+[.,]\d+)\s*cm\b", re.IGNORECASE)
_PAD_MM = re.compile(r"\b(\d+[.,]\d+)\s*mm\b", re.IGNORECASE)

# Padrões para vãos/medidas arquitetônicas (ex: "3.50", "4,20")
_PAD_VAO = re.compile(r"\b([1-9]\d*[.,]\d{1,2})\b")

# Detectar cargas
_PAD_KNM2 = re.compile(r"(\d+[.,]?\d*)\s*kN/m[²2]?", re.IGNORECASE)
_PAD_TFM2 = re.compile(r"(\d+[.,]?\d*)\s*tf/m[²2]?",  re.IGNORECASE)


def extrair_dimensoes_pdf(dados_arquivo: bytes, nome_arquivo: str = "") -> dict:
    """
    Extrai dimensões e cargas de um PDF.
    Retorna dict com listas de valores encontrados.
    """
    if not PDF_DISPONIVEL:
        return {"erro": "pdfplumber não instalado", "texto": "", "dimensoes_m": [],
                "cargas_kNm2": []}

    resultado = {
        "nome_arquivo": nome_arquivo,
        "paginas": 0,
        "texto_completo": "",
        "dimensoes_m": [],
        "dimensoes_cm": [],
        "cargas_kNm2": [],
        "palavras_chave": [],
    }

    palavras_est = ["laje", "viga", "pilar", "fundação", "fundacao", "baldrame",
                    "sapata", "estaca", "fck", "fyk", "ca-50", "ca-60",
                    "treliçada", "trelicada", "maciça", "macica", "muro"]

    try:
        with pdfplumber.open(io.BytesIO(dados_arquivo)) as pdf:
            resultado["paginas"] = len(pdf.pages)
            textos = []
            for page in pdf.pages:
                t = page.extract_text() or ""
                textos.append(t)
            texto = "\n".join(textos)
            resultado["texto_completo"] = texto[:5000]  # limita tamanho

        # Extrair dimensões em metros
        for m in _PAD_M.finditer(texto):
            v = float(m.group(1).replace(",", "."))
            if 0.1 <= v <= 50:
                resultado["dimensoes_m"].append(v)

        # Extrair dimensões em cm → converter para m
        for m in _PAD_CM.finditer(texto):
            v = float(m.group(1).replace(",", ".")) / 100
            if 0.05 <= v <= 20:
                resultado["dimensoes_cm"].append(round(v, 3))

        # Cargas kN/m²
        for m in _PAD_KNM2.finditer(texto):
            v = float(m.group(1).replace(",", "."))
            if 0 < v <= 50:
                resultado["cargas_kNm2"].append(v)

        # Cargas tf/m² → kN/m²
        for m in _PAD_TFM2.finditer(texto):
            v = float(m.group(1).replace(",", ".")) * 9.81
            resultado["cargas_kNm2"].append(round(v, 2))

        # Palavras-chave estruturais encontradas
        texto_lower = texto.lower()
        for pw in palavras_est:
            if pw in texto_lower:
                resultado["palavras_chave"].append(pw)

    except Exception as e:
        resultado["erro"] = str(e)

    # Deduplica e ordena
    resultado["dimensoes_m"]  = sorted(set(resultado["dimensoes_m"]))
    resultado["dimensoes_cm"] = sorted(set(resultado["dimensoes_cm"]))
    resultado["cargas_kNm2"]  = sorted(set(resultado["cargas_kNm2"]))
    resultado["texto_bruto"]  = resultado["texto_completo"]  # alias para pipeline

    return resultado
