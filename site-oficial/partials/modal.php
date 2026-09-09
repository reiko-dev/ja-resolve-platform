<!-- Modal Quero ser Parceiro -->
<div class="modal fade" id="modalParceiro" tabindex="-1" aria-labelledby="modalParceiroLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
            <div class="modal-header bg-dark-blue text-white">
                <h5 class="modal-title fw-bold" id="modalParceiroLabel">Cadastre sua empresa</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
                <form id="formParceiro" class="needs-validation" novalidate>
                    <div class="row g-3">
                        <div class="col-md-12">
                            <label for="nome" class="form-label fw-medium">Nome completo</label>
                            <input type="text" class="form-control" id="nome" name="nome" required>
                            <div class="invalid-feedback">Por favor, insira seu nome completo.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="cpf" class="form-label fw-medium">CPF</label>
                            <input type="text" class="form-control" id="cpf" name="cpf" required>
                            <div class="invalid-feedback">Insira um CPF válido.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="data_nascimento" class="form-label fw-medium">Data de nascimento</label>
                            <input type="date" class="form-control" id="data_nascimento" name="data_nascimento" required>
                            <div class="invalid-feedback">Informe sua data de nascimento.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="telefone" class="form-label fw-medium">Telefone WhatsApp</label>
                            <input type="text" class="form-control" id="telefone" name="telefone" required>
                            <div class="invalid-feedback">Informe um número de WhatsApp.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="email" class="form-label fw-medium">E-mail</label>
                            <input type="email" class="form-control" id="email" name="email" required>
                            <div class="invalid-feedback">Insira um e-mail válido.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="cidade" class="form-label fw-medium">Cidade / Estado</label>
                            <input type="text" class="form-control" id="cidade" name="cidade" required>
                            <div class="invalid-feedback">Informe sua cidade.</div>
                        </div>

                        <div class="col-md-6">
                            <label for="servico" class="form-label fw-medium">Qual serviço deseja oferecer?</label>
                            <select class="form-select" id="servico" name="servico" required>
                                <option value="" selected disabled>Selecione uma opção...</option>
                                <option value="Guincho">Guincho</option>
                                <option value="Mecânico">Mecânico</option>
                                <option value="Posto de gasolina">Posto de gasolina</option>
                                <option value="Vendas de autopeças">Vendas de autopeças</option>
                            </select>
                            <div class="invalid-feedback">Selecione um serviço.</div>
                        </div>
                    </div>

                    <div class="d-grid mt-4">
                        <button type="submit" class="btn btn-red-primary btn-lg fw-bold" id="btnSubmitParceiro">
                            <span class="btn-text">Enviar Solicitação</span>
                            <span class="spinner-border spinner-border-sm d-none ms-2" id="loadingSpinner" role="status" aria-hidden="true"></span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>