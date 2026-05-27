"""Modelos ORM."""
import datetime
import json
from .database import db


class Projeto(db.Model):
    __tablename__ = "projetos"
    id          = db.Column(db.Integer, primary_key=True)
    nome        = db.Column(db.String(200), nullable=False)
    local       = db.Column(db.String(200))
    responsavel = db.Column(db.String(200))
    descricao   = db.Column(db.Text)
    criado_em   = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    arquivos    = db.relationship("Arquivo", backref="projeto", lazy=True, cascade="all,delete")
    calculos    = db.relationship("Calculo", backref="projeto", lazy=True, cascade="all,delete")


class Arquivo(db.Model):
    __tablename__ = "arquivos"
    id           = db.Column(db.Integer, primary_key=True)
    projeto_id   = db.Column(db.Integer, db.ForeignKey("projetos.id"), nullable=False)
    nome_original = db.Column(db.String(300))
    nome_salvo   = db.Column(db.String(300))
    tipo_arquivo = db.Column(db.String(20))   # pdf, dxf, dwg, ifc, rvt
    _dados_extra = db.Column("dados_extra", db.Text)
    criado_em    = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    @property
    def dados_extra(self):
        return json.loads(self._dados_extra) if self._dados_extra else {}

    @dados_extra.setter
    def dados_extra(self, val):
        self._dados_extra = json.dumps(val, ensure_ascii=False)


class Calculo(db.Model):
    __tablename__ = "calculos"
    id            = db.Column(db.Integer, primary_key=True)
    projeto_id    = db.Column(db.Integer, db.ForeignKey("projetos.id"), nullable=False)
    elemento_tipo = db.Column(db.String(50))   # laje_macica, laje_trelicada, viga, pilar…
    descricao     = db.Column(db.String(200))
    _parametros   = db.Column("parametros", db.Text)
    _resultado    = db.Column("resultado",  db.Text)
    criado_em     = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    @property
    def parametros(self):
        return json.loads(self._parametros) if self._parametros else {}

    @parametros.setter
    def parametros(self, val):
        self._parametros = json.dumps(val, ensure_ascii=False)

    @property
    def resultado(self):
        return json.loads(self._resultado) if self._resultado else {}

    @resultado.setter
    def resultado(self, val):
        self._resultado = json.dumps(val, ensure_ascii=False)
