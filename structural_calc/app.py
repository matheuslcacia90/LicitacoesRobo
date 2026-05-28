"""
StructCalc – Software de Cálculo Estrutural
Servidor Flask principal.
"""
import os
import datetime
import json
import uuid
from flask import (
    Flask, render_template, request, jsonify, redirect, url_for,
    send_file, flash, abort,
)
from werkzeug.utils import secure_filename

from .database import db, init_db
from .models import Projeto, Arquivo, Calculo
from .calculations import (
    calcular_laje_macica, calcular_laje_trelicada,
    calcular_viga, calcular_pilar,
    calcular_sapata_isolada, calcular_viga_baldrame, calcular_estaca,
    calcular_muro_arrimo, calcular_alvenaria_estrutural,
)
from .calculations.normas import (
    CONCRETOS, ACOS, COBRIMENTOS, USOS,
)
from .calculations.laje import TIPOS_TRELICADA
from .calculations.fundacoes import TIPOS_ESTACA
from .calculations.alvenaria import BLOCOS as BLOCOS_ALV

try:
    from .reports import gerar_memorial
    RELATORIO_OK = True
except ImportError:
    RELATORIO_OK = False

from .analysis.pipeline import analisar_e_calcular

try:
    from .parsers import extrair_dimensoes_pdf, extrair_dimensoes_dxf
    from .parsers.dxf_parser import extrair_dimensoes_ifc
    PARSERS_OK = True
except ImportError:
    PARSERS_OK = False

# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

EXTENSOES_PERMITIDAS = {"pdf", "dxf", "dwg", "ifc", "rvt", "png", "jpg", "jpeg"}


def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "structcalc-secret-2025")

    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    app.config["UPLOAD_FOLDER"] = uploads_dir
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024   # 100 MB

    db_path = os.path.join(os.path.dirname(__file__), "instance", "structcalc.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    init_db(app)

    # -----------------------------------------------------------------------
    # Contexto global de templates
    # -----------------------------------------------------------------------
    @app.context_processor
    def inject_globals():
        return {
            "concretos": list(CONCRETOS.keys()),
            "acos": list(ACOS.keys()),
            "cobrimentos": COBRIMENTOS,
            "usos": USOS,
            "tipos_trelica": list(TIPOS_TRELICADA.keys()),
            "tipos_estaca": list(TIPOS_ESTACA.keys()),
            "blocos_alv": BLOCOS_ALV,
            "agora": datetime.date.today().strftime("%d/%m/%Y"),
        }

    # -----------------------------------------------------------------------
    # Rotas principais
    # -----------------------------------------------------------------------

    @app.route("/")
    def index():
        projetos = Projeto.query.order_by(Projeto.criado_em.desc()).all()
        return render_template("index.html", projetos=projetos)

    @app.route("/projeto/novo", methods=["GET", "POST"])
    def novo_projeto():
        if request.method == "POST":
            p = Projeto(
                nome=request.form["nome"],
                local=request.form.get("local", ""),
                responsavel=request.form.get("responsavel", ""),
                descricao=request.form.get("descricao", ""),
            )
            db.session.add(p)
            db.session.commit()
            flash("Projeto criado com sucesso!", "success")
            return redirect(url_for("projeto", pid=p.id))
        return render_template("novo_projeto.html")

    @app.route("/projeto/<int:pid>")
    def projeto(pid):
        p = Projeto.query.get_or_404(pid)
        calculos = Calculo.query.filter_by(projeto_id=pid).order_by(Calculo.criado_em).all()
        return render_template("projeto.html", projeto=p, calculos=calculos)

    @app.route("/projeto/<int:pid>/excluir", methods=["POST"])
    def excluir_projeto(pid):
        p = Projeto.query.get_or_404(pid)
        db.session.delete(p)
        db.session.commit()
        flash("Projeto excluído.", "info")
        return redirect(url_for("index"))

    # -----------------------------------------------------------------------
    # Upload de arquivos
    # -----------------------------------------------------------------------

    @app.route("/projeto/<int:pid>/upload", methods=["POST"])
    def upload_arquivo(pid):
        p = Projeto.query.get_or_404(pid)
        if "arquivo" not in request.files:
            return jsonify({"erro": "Nenhum arquivo enviado"}), 400

        f = request.files["arquivo"]
        if f.filename == "":
            return jsonify({"erro": "Nome de arquivo vazio"}), 400

        ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
        if ext not in EXTENSOES_PERMITIDAS:
            return jsonify({"erro": f"Extensão .{ext} não suportada"}), 400

        nome_seguro = f"{uuid.uuid4().hex}_{secure_filename(f.filename)}"
        caminho = os.path.join(app.config["UPLOAD_FOLDER"], nome_seguro)
        f.save(caminho)
        dados_extra = {}

        if PARSERS_OK:
            with open(caminho, "rb") as fp:
                conteudo = fp.read()
            if ext == "pdf":
                dados_extra = extrair_dimensoes_pdf(conteudo, f.filename)
            elif ext in ("dxf", "dwg"):
                dados_extra = extrair_dimensoes_dxf(conteudo, f.filename)
            elif ext == "ifc":
                dados_extra = extrair_dimensoes_ifc(conteudo, f.filename)
            elif ext == "rvt":
                dados_extra = {"mensagem": "Arquivo Revit (.rvt): exporte para IFC para análise automática."}

        arq = Arquivo(
            projeto_id=p.id,
            nome_original=f.filename,
            nome_salvo=nome_seguro,
            tipo_arquivo=ext,
        )
        arq.dados_extra = dados_extra
        db.session.add(arq)
        db.session.commit()

        return jsonify({
            "mensagem": "Upload realizado",
            "arquivo_id": arq.id,
            "tipo": ext,
            "dados_extras": dados_extra,
        })

    @app.route("/projeto/<int:pid>/arquivos")
    def listar_arquivos(pid):
        arqs = Arquivo.query.filter_by(projeto_id=pid).all()
        return jsonify([{
            "id": a.id,
            "nome": a.nome_original,
            "tipo": a.tipo_arquivo,
            "criado_em": a.criado_em.strftime("%d/%m/%Y %H:%M"),
            "dados_extra": a.dados_extra,
        } for a in arqs])

    @app.route("/arquivo/<int:aid>/excluir", methods=["POST"])
    def excluir_arquivo(aid):
        arq = Arquivo.query.get_or_404(aid)
        pid = arq.projeto_id
        caminho = os.path.join(app.config["UPLOAD_FOLDER"], arq.nome_salvo)
        if os.path.exists(caminho):
            os.remove(caminho)
        db.session.delete(arq)
        db.session.commit()
        return jsonify({"mensagem": "Arquivo excluído"})

    # -----------------------------------------------------------------------
    # Cálculos – rotas da interface
    # -----------------------------------------------------------------------

    @app.route("/calcular/<int:pid>")
    def calcular_page(pid):
        p = Projeto.query.get_or_404(pid)
        return render_template("calcular.html", projeto=p)

    # -----------------------------------------------------------------------
    # API de cálculo – todas retornam JSON
    # -----------------------------------------------------------------------

    def _salvar_calculo(pid, tipo, descricao, params, resultado):
        c = Calculo(projeto_id=pid, elemento_tipo=tipo, descricao=descricao)
        c.parametros = params
        c.resultado  = resultado
        db.session.add(c)
        db.session.commit()
        return c.id

    def _num(d, campo, minimo=None, maximo=None, default=None):
        """Extrai e valida campo numérico; levanta ValueError com mensagem clara."""
        raw = d.get(campo, default)
        if raw is None:
            raise ValueError(f"Campo obrigatório ausente: '{campo}'")
        try:
            v = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"'{campo}' deve ser numérico (recebeu: {raw!r})")
        if minimo is not None and v < minimo:
            raise ValueError(f"'{campo}' deve ser ≥ {minimo} (recebeu {v})")
        if maximo is not None and v > maximo:
            raise ValueError(f"'{campo}' deve ser ≤ {maximo} (recebeu {v})")
        return v

    @app.route("/api/calcular/laje", methods=["POST"])
    def api_laje():
        d = request.get_json(force=True)
        pid = d.get("projeto_id")
        subtipo = d.get("subtipo", "macica")

        try:
            if subtipo == "macica":
                res = calcular_laje_macica(
                    lx_m=_num(d, "lx", 0.5, 20),
                    ly_m=_num(d, "ly", 0.5, 25),
                    g_kNm2=_num(d, "g", 0, 30, 1.0),
                    q_kNm2=_num(d, "q", 0, 20, 1.5),
                    fck=int(_num(d, "fck", 20, 90, 25)),
                    aco=d.get("aco", "CA-50"),
                    cobrimento_classe=d.get("cobrimento", "CA-IV"),
                    tipo_apoio=d.get("apoio", "simples"),
                    uso=d.get("uso", "normal"),
                )
            else:
                res = calcular_laje_trelicada(
                    lx_m=_num(d, "lx", 0.5, 20),
                    g_kNm2=_num(d, "g", 0, 30, 1.0),
                    q_kNm2=_num(d, "q", 0, 20, 1.5),
                    fck=int(_num(d, "fck", 20, 90, 25)),
                    tipo_trelica=d.get("tipo_trelica", "12+04"),
                    aco=d.get("aco", "CA-50"),
                    cobrimento_classe=d.get("cobrimento", "CA-IV"),
                    tipo_apoio=d.get("apoio", "simples"),
                    uso=d.get("uso", "normal"),
                )

            if pid:
                cid = _salvar_calculo(pid, f"laje_{subtipo}",
                                      d.get("descricao", f"Laje {subtipo}"),
                                      d, res)
                res["calculo_id"] = cid

            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    @app.route("/api/calcular/viga", methods=["POST"])
    def api_viga():
        d = request.get_json(force=True)
        pid = d.get("projeto_id")
        try:
            res = calcular_viga(
                l_m=_num(d, "l", 0.5, 30),
                bw_m=_num(d, "bw", 0.10, 1.5, 0.20),
                h_m=_num(d, "h", 0.20, 2.5, 0.50),
                g_kNm=_num(d, "g", 0, 200, 5.0),
                q_kNm=_num(d, "q", 0, 200, 3.0),
                fck=int(_num(d, "fck", 20, 90, 25)),
                aco=d.get("aco", "CA-50"),
                cobrimento_classe=d.get("cobrimento", "CA-IV"),
                tipo_apoio=d.get("apoio", "simples"),
                secao=d.get("secao", "retangular"),
                beff_m=float(d.get("beff", 0)),
                hf_m=float(d.get("hf", 0)),
            )
            if pid:
                cid = _salvar_calculo(pid, "viga",
                                      d.get("descricao", "Viga"),
                                      d, res)
                res["calculo_id"] = cid
            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    @app.route("/api/calcular/pilar", methods=["POST"])
    def api_pilar():
        d = request.get_json(force=True)
        pid = d.get("projeto_id")
        try:
            res = calcular_pilar(
                Nd_kN=_num(d, "Nd", 1, 50000),
                Mx_kNm=_num(d, "Mx", None, None, 0),
                My_kNm=_num(d, "My", None, None, 0),
                b_m=_num(d, "b", 0.12, 3.0, 0.20),
                h_m=_num(d, "h", 0.12, 3.0, 0.30),
                l_m=_num(d, "l", 0.5, 50, 3.0),
                fck=int(_num(d, "fck", 20, 90, 25)),
                aco=d.get("aco", "CA-50"),
                cobrimento_classe=d.get("cobrimento", "CA-IV"),
                condicao_vinculo=d.get("vinculo", "biarticulado"),
                forma=d.get("forma", "retangular"),
            )
            if pid:
                cid = _salvar_calculo(pid, "pilar",
                                      d.get("descricao", "Pilar"),
                                      d, res)
                res["calculo_id"] = cid
            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    @app.route("/api/calcular/fundacao", methods=["POST"])
    def api_fundacao():
        d = request.get_json(force=True)
        pid    = d.get("projeto_id")
        subtipo = d.get("subtipo", "sapata_isolada")
        try:
            if subtipo == "sapata_isolada":
                Nd = _num(d, "Nd", 10, 50000)
                res = calcular_sapata_isolada(
                    Nd_kN=Nd,
                    Nk_kN=_num(d, "Nk", 1, None, Nd / 1.4),
                    b_pilar_m=_num(d, "b_pilar", 0.12, 2.0, 0.20),
                    h_pilar_m=_num(d, "h_pilar", 0.12, 2.0, 0.30),
                    n_spt=int(_num(d, "nspt", 1, 60, 10)),
                    tipo_solo=d.get("solo", "areia"),
                    fck=int(_num(d, "fck", 20, 90, 25)),
                    aco=d.get("aco", "CA-50"),
                    cobrimento_classe=d.get("cobrimento", "CA-III"),
                )
            elif subtipo == "viga_baldrame":
                res = calcular_viga_baldrame(
                    q_kNm=_num(d, "q", 1, 500, 20.0),
                    l_m=_num(d, "l", 0.5, 20, 4.0),
                    n_spt=int(_num(d, "nspt", 1, 60, 10)),
                    tipo_solo=d.get("solo", "areia"),
                    fck=int(_num(d, "fck", 20, 90, 25)),
                    aco=d.get("aco", "CA-50"),
                    cobrimento_classe=d.get("cobrimento", "CA-III"),
                )
            elif subtipo == "estaca":
                res = calcular_estaca(
                    Nk_kN=_num(d, "Nk", 10, 20000, 100),
                    Nd_kN=_num(d, "Nd", 10, 30000, 140),
                    n_spt_ponta=int(_num(d, "nspt_ponta", 1, 60, 15)),
                    n_spt_fuste=_num(d, "nspt_fuste", 1, 60, 8),
                    h_estaca_m=_num(d, "h_estaca", 1, 80, 10),
                    d_estaca_m=_num(d, "d_estaca", 0.10, 2.0, 0.35),
                    tipo_estaca=d.get("tipo_estaca", "concreto_moldada_local"),
                )
            else:
                return jsonify({"erro": f"Subtipo '{subtipo}' não reconhecido"}), 422

            if pid:
                cid = _salvar_calculo(pid, f"fundacao_{subtipo}",
                                      d.get("descricao", f"Fundação {subtipo}"),
                                      d, res)
                res["calculo_id"] = cid
            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    @app.route("/api/calcular/muro", methods=["POST"])
    def api_muro():
        d = request.get_json(force=True)
        pid = d.get("projeto_id")
        try:
            res = calcular_muro_arrimo(
                H_m=_num(d, "H", 0.5, 15),
                phi_graus=_num(d, "phi", 10, 45, 30),
                gamma_solo=_num(d, "gamma_solo", 10, 25, 18),
                q_sobrecarga=_num(d, "q_sob", 0, 100, 0),
                tipo=d.get("tipo", "balanco"),
                fck=int(_num(d, "fck", 20, 90, 25)),
                aco=d.get("aco", "CA-50"),
                cobrimento_classe=d.get("cobrimento", "CA-II"),
                sigma_adm_solo=float(d.get("sigma_adm", 150)),
            )
            if pid:
                cid = _salvar_calculo(pid, "muro_arrimo",
                                      d.get("descricao", "Muro de Arrimo"),
                                      d, res)
                res["calculo_id"] = cid
            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    @app.route("/api/calcular/alvenaria", methods=["POST"])
    def api_alvenaria():
        d = request.get_json(force=True)
        pid = d.get("projeto_id")
        try:
            res = calcular_alvenaria_estrutural(
                Nd_kN_m=_num(d, "Nd", 1, 2000),
                h_parede_m=_num(d, "h", 1.0, 15.0, 3.0),
                e_parede_m=_num(d, "e", 0.09, 0.40, 0.14),
                tipo_bloco=d.get("bloco", "concreto_6MPa"),
                vinculo=d.get("vinculo", "engastado_topo"),
                controle=d.get("controle", "normal"),
            )
            if pid:
                cid = _salvar_calculo(pid, "alvenaria",
                                      d.get("descricao", "Alvenaria Estrutural"),
                                      d, res)
                res["calculo_id"] = cid
            return jsonify(res)
        except Exception as e:
            return jsonify({"erro": str(e)}), 422

    # -----------------------------------------------------------------------
    # Exclusão de cálculo
    # -----------------------------------------------------------------------

    @app.route("/calculo/<int:cid>/excluir", methods=["POST"])
    def excluir_calculo(cid):
        c = Calculo.query.get_or_404(cid)
        pid = c.projeto_id
        db.session.delete(c)
        db.session.commit()
        return jsonify({"mensagem": "Cálculo excluído", "projeto_id": pid})

    # -----------------------------------------------------------------------
    # Relatório PDF
    # -----------------------------------------------------------------------

    @app.route("/projeto/<int:pid>/relatorio")
    def relatorio(pid):
        if not RELATORIO_OK:
            abort(501, "reportlab não instalado")

        p = Projeto.query.get_or_404(pid)
        calculos_db = Calculo.query.filter_by(projeto_id=pid).order_by(Calculo.criado_em).all()

        if not calculos_db:
            flash("Nenhum cálculo salvo neste projeto.", "warning")
            return redirect(url_for("projeto", pid=pid))

        projeto_info = {
            "nome":        p.nome,
            "local":       p.local or "—",
            "responsavel": p.responsavel or "—",
            "descricao":   p.descricao or "—",
            "data":        p.criado_em.strftime("%d/%m/%Y"),
        }
        calculos_res = [c.resultado for c in calculos_db]

        pdf_bytes = gerar_memorial(projeto_info, calculos_res)

        import io
        buf = io.BytesIO(pdf_bytes)
        buf.seek(0)
        nome_pdf = f"memorial_{p.nome.replace(' ', '_')}.pdf"
        return send_file(buf, mimetype="application/pdf",
                         as_attachment=True, download_name=nome_pdf)

    # -----------------------------------------------------------------------
    # API: dados de um cálculo salvo
    # -----------------------------------------------------------------------

    @app.route("/api/calculo/<int:cid>")
    def api_get_calculo(cid):
        c = Calculo.query.get_or_404(cid)
        return jsonify({
            "id": c.id,
            "tipo": c.elemento_tipo,
            "descricao": c.descricao,
            "parametros": c.parametros,
            "resultado": c.resultado,
            "criado_em": c.criado_em.strftime("%d/%m/%Y %H:%M"),
        })

    # -----------------------------------------------------------------------
    # API: análise automática do projeto
    # -----------------------------------------------------------------------

    @app.route("/projeto/<int:pid>/analisar", methods=["POST"])
    def analisar_projeto(pid):
        projeto = Projeto.query.get_or_404(pid)
        arquivos = Arquivo.query.filter_by(projeto_id=pid).all()

        arqs_texto = []
        for arq in arquivos:
            caminho = os.path.join(app.config["UPLOAD_FOLDER"], arq.nome_salvo)
            texto = ""
            try:
                if arq.tipo_arquivo == "pdf":
                    from .parsers.pdf_parser import extrair_dimensoes_pdf
                    with open(caminho, "rb") as f:
                        info = extrair_dimensoes_pdf(f.read(), arq.nome_original)
                    texto = info.get("texto_bruto", "") + " " + " ".join(
                        str(v) for v in info.get("dimensoes", [])
                    )
                elif arq.tipo_arquivo in ("dxf", "dwg"):
                    from .parsers.dxf_parser import extrair_dimensoes_dxf
                    with open(caminho, "rb") as f:
                        info = extrair_dimensoes_dxf(f.read(), arq.nome_original)
                    texto = info.get("texto_bruto", "") + " " + json.dumps(info)
                elif arq.tipo_arquivo == "ifc":
                    from .parsers.dxf_parser import extrair_dimensoes_ifc
                    with open(caminho, "rb") as f:
                        info = extrair_dimensoes_ifc(f.read(), arq.nome_original)
                    texto = info.get("texto_bruto", "") + " " + json.dumps(info)
            except Exception:
                pass

            if arq.dados_extra:
                texto += " " + json.dumps(arq.dados_extra)

            arqs_texto.append({
                "nome_original": arq.nome_original,
                "dados_texto": texto,
            })

        # Inclui nome e descrição do projeto como texto de contexto
        arqs_texto.append({
            "nome_original": "Projeto",
            "dados_texto": f"{projeto.nome} {projeto.descricao or ''} {projeto.local or ''}",
        })

        resultado = analisar_e_calcular(pid, arqs_texto, db.session)
        return jsonify(resultado)

    return app
