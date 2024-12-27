from flask import Flask, jsonify
from .database import db

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///licitacoes.db'  # Você pode mudar para PostgreSQL mais tarde
db.init_app(app)

@app.route('/')
def hello():
    return jsonify({"message": "Bem-vindo ao Sistema de Gerenciamento de Licitações"})

if __name__ == '__main__':
    app.run(debug=True)