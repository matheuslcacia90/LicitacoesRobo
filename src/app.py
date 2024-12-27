from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Bem-vindo ao Sistema de Gerenciamento de Licitações'

if __name__ == '__main__':
    app.run(debug=True)