"""
Módulo de análise automática de projetos estruturais.
Reconhece elementos e executa cálculos automaticamente.
"""
from .recognizer import reconhecer_elementos
from .pipeline import analisar_e_calcular, calcular_elemento

__all__ = ["reconhecer_elementos", "analisar_e_calcular", "calcular_elemento"]
