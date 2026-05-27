"""Ponto de entrada para o software de cálculo estrutural."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from structural_calc import create_app

app = create_app()

if __name__ == "__main__":
    print("=" * 60)
    print("  StructCalc – Software de Cálculo Estrutural")
    print("  Acesse: http://localhost:5001")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5001, debug=True)
