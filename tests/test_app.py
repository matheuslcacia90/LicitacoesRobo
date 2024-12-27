import pytest
from src.app import app
from src.database import get_db, engine
from src import models

@pytest.fixture
def client():
    app.config['TESTING'] = True
    models.Base.metadata.create_all(bind=engine)
    with app.test_client() as client:
        yield client
    models.Base.metadata.drop_all(bind=engine)

def test_hello_world(client):
    response = client.get('/')
    assert response.status_code == 200
    assert b'Bem-vindo ao Sistema de Gerenciamento de Licitacoes' in response.data

def test_listar_licitacoes(client, mocker):
    # Mock da função coletar_licitacoes para não depender de uma API externa durante os testes
    mock_licitacoes = [
        models.Licitacao(numero="001/2023", objeto="Teste", data_abertura="2023-01-01", valor_estimado=1000.0, status="Aberta")
    ]
    mocker.patch('src.licitacoes_collector.coletar_licitacoes', return_value=mock_licitacoes)

    response = client.get('/licitacoes')
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]['numero'] == "001/2023"