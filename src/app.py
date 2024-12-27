from flask import Flask, jsonify
from .database import engine, get_db
from . import models
from .licitacoes_collector import coletar_licitacoes

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Bem-vindo ao Sistema de Gerenciamento de Licitações'

if __name__ == '__main__':
    app.run(debug=True)