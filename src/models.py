from .database import db

class Licitacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(50), unique=True, nullable=False)
    objeto = db.Column(db.Text, nullable=False)
    data_abertura = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), nullable=False)

    def __repr__(self):
        return f'<Licitacao {self.numero}>'