<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Já Resolve - Assistência Automotiva</title>
    <?php include 'partials/head.php'; ?>
</head>

<body>

    <?php include 'partials/navbar.php'; ?>

    <section id="inicio" class="hero-section position-relative overflow-hidden">

        <!-- Imagem completa do Hero -->
        <div class="hero-bg"></div>

        <div class="container position-relative z-1">
            <div class="row align-items-center pt-5 pb-5">

                <!-- CONTEÚDO -->
                <div class="col-lg-6 pt-5">

                    <h1 class="display-4 fw-bold text-dark-blue mb-3">
                        Precisou de ajuda <br>
                        na estrada?<br>

                        <span class="text-red">
                            Já <span class="fst-italic">Resolve!</span>
                        </span>
                    </h1>

                    <p class="lead text-secondary mb-4 fs-6 w-75">
                        Conectamos motoristas a prestadores de serviço próximos
                        de você com agilidade, segurança e muita praticidade.
                    </p>

                    <div class="d-flex gap-3 mb-4">

                        <a href="#"
                            class="btn btn-red-primary btn-lg rounded-pill px-4 fs-6">
                            Baixar Aplicativo
                            <i class="bi bi-download ms-2"></i>
                        </a>

                        <a href="#"
                            class="btn btn-outline-dark-blue btn-lg rounded-pill px-4 fs-6"
                            data-bs-toggle="modal"
                            data-bs-target="#modalParceiro">

                            Quero ser Parceiro
                            <i class="bi bi-person ms-2"></i>
                        </a>

                    </div>

                    <div class="social-proof d-flex align-items-center gap-3 mt-5">

                        <div class="avatars-group">
                            <img src="assets/img/avatar.png"
                                class="rounded-circle border border-2 border-white"
                                width="120"
                                alt="Usuários">
                        </div>

                        <p class="mb-0 text-muted small lh-sm">
                            Mais de <strong>10.000</strong> motoristas e parceiros<br>
                            já confiam no Já Resolve!
                        </p>

                    </div>

                    <div class="store-badges mt-4 d-flex gap-3">

                        <img src="assets/img/googleplay.png"
                            alt="Google Play"
                            height="60">

                        <img src="assets/img/appstore.png"
                            alt="App Store"
                            height="60">

                    </div>

                </div>

            </div>
        </div>

    </section>

    <section class="info-bar bg-dark-blue text-white py-4">
        <div class="container">
            <div class="row justify-content-center align-items-center text-center text-md-start gy-4">
                <div class="col-6 col-md-3 d-flex align-items-center justify-content-center gap-3">
                    <i class="fa-regular fa-clock fs-1 text-white opacity-75"></i>
                    <span class="fw-normal lh-sm text-start" style="font-size: 0.95rem;">Atendimento<br>rápido</span>
                </div>
                <div class="col-6 col-md-3 d-flex align-items-center justify-content-center gap-3">
                    <i class="fa-solid fa-user-shield fs-1 text-white opacity-75"></i>
                    <span class="fw-normal lh-sm text-start" style="font-size: 0.95rem;">Profissionais<br>verificados</span>
                </div>
                <div class="col-6 col-md-3 d-flex align-items-center justify-content-center gap-3">
                    <i class="fa-solid fa-location-dot fs-1 text-white opacity-75"></i>
                    <span class="fw-normal lh-sm text-start" style="font-size: 0.95rem;">Serviços<br>próximos</span>
                </div>
                <div class="col-6 col-md-3 d-flex align-items-center justify-content-center gap-3">
                    <i class="fa-solid fa-headset fs-1 text-white opacity-75"></i>
                    <span class="fw-normal lh-sm text-start" style="font-size: 0.95rem;">Suporte<br>24 horas</span>
                </div>
            </div>
        </div>
    </section>

    <section id="como-funciona" class="py-5 bg-white">
        <div class="container py-4">
            <div class="section-title mb-5">
                <h4 class="fw-bold text-dark-blue">COMO FUNCIONA</h4>
            </div>

            <div class="row g-5">
                <div class="col-lg-6">
                    <h5 class="text-blue-custom fw-bold text-center mb-4">Para quem precisa de ajuda</h5>
                    <div class="row g-3">
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-blue-custom">1</div><i class="fa-solid fa-mobile-screen fs-3 text-blue-custom mb-2"></i>
                                <p class="small mb-0 lh-sm">Abra o aplicativo e informe o que aconteceu</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-blue-custom">2</div><i class="fa-solid fa-map-location-dot fs-3 text-blue-custom mb-2"></i>
                                <p class="small mb-0 lh-sm">Encontre prestadores próximos</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-blue-custom">3</div><i class="fa-solid fa-user-check fs-3 text-blue-custom mb-2"></i>
                                <p class="small mb-0 lh-sm">Escolha o profissional e confirme</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-blue-custom">4</div><i class="fa-regular fa-thumbs-up fs-3 text-blue-custom mb-2"></i>
                                <p class="small mb-0 lh-sm">Receba o atendimento e acompanhe tudo pelo app</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-lg-6">
                    <h5 class="text-red fw-bold text-center mb-4">Para quem presta serviços</h5>
                    <div class="row g-3">
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-red-primary">1</div><i class="fa-solid fa-store fs-3 text-red mb-2"></i>
                                <p class="small mb-0 lh-sm">Cadastre sua empresa</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-red-primary">2</div><i class="fa-regular fa-file-lines fs-3 text-red mb-2"></i>
                                <p class="small mb-0 lh-sm">Envie sua documentação</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-red-primary">3</div><i class="fa-solid fa-certificate fs-3 text-red mb-2"></i>
                                <p class="small mb-0 lh-sm">Seja aprovado e habilitado</p>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="step-card">
                                <div class="step-number bg-red-primary">4</div><i class="fa-solid fa-bell fs-3 text-red mb-2"></i>
                                <p class="small mb-0 lh-sm">Receba chamadas e aumente seus ganhos</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="py-5 bg-gray-light">
        <div class="container py-3">
            <div class="section-title mb-5">
                <h4 class="fw-bold text-dark-blue">CATEGORIAS DE PARCEIROS</h4>
            </div>

            <div class="row row-cols-2 row-cols-md-5 g-4 text-center justify-content-center">
                <div class="col">
                    <div class="category-icon bg-blue-custom mx-auto mb-3"><i class="fa-solid fa-wrench text-white fs-2"></i></div>
                    <h6 class="fw-bold text-dark-blue">Mecânicos</h6>
                    <p class="small text-muted lh-sm">Manutenção, reparos e assistência técnica.</p>
                </div>
                <div class="col">
                    <div class="category-icon bg-red-primary mx-auto mb-3"><i class="fa-solid fa-truck-pickup text-white fs-2"></i></div>
                    <h6 class="fw-bold text-dark-blue">Guinchos</h6>
                    <p class="small text-muted lh-sm">Remoção de veículos com agilidade e segurança.</p>
                </div>
                <div class="col">
                    <div class="category-icon bg-green mx-auto mb-3"><i class="fa-solid fa-gas-pump text-white fs-2"></i></div>
                    <h6 class="fw-bold text-dark-blue">Postos de Combustível</h6>
                    <p class="small text-muted lh-sm">Abastecimento, socorro e muito mais.</p>
                </div>
                <div class="col">
                    <div class="category-icon bg-orange mx-auto mb-3"><i class="fa-solid fa-gear text-white fs-2"></i></div>
                    <h6 class="fw-bold text-dark-blue">Autopeças</h6>
                    <p class="small text-muted lh-sm">Peças e acessórios com entrega rápida.</p>
                </div>
                <div class="col">
                    <div class="category-icon bg-purple mx-auto mb-3"><i class="fa-solid fa-motorcycle text-white fs-2"></i></div>
                    <h6 class="fw-bold text-dark-blue">Motoboys</h6>
                    <p class="small text-muted lh-sm">Entregas rápidas de pequenos volumes.</p>
                </div>
            </div>
        </div>
    </section>

    <section class="container-fluid p-0" id="parceiros">
        <div class="split-container">
            <div class="split-half bg-dark-blue text-white">
                <div class="split-content ps-md-5">
                    <h3 class="fw-bold mb-4">Benefícios para Motoristas</h3>
                    <ul class="list-unstyled d-flex flex-column gap-3 mb-0">
                        <li><i class="fa-solid fa-circle-check me-2"></i> Atendimento mais rápido</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Profissionais verificados</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Acompanhe tudo pelo app</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Mais segurança para você</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Histórico de atendimentos</li>
                    </ul>
                </div>
                <div class="split-img-box" style="background-image: url('assets/img/motorista-feliz.png');"></div>
            </div>

            <div class="split-half bg-red-primary text-white">
                <div class="split-content ps-md-5">
                    <h3 class="fw-bold mb-4">Benefícios para Parceiros</h3>
                    <ul class="list-unstyled d-flex flex-column gap-3 mb-0">
                        <li><i class="fa-solid fa-circle-check me-2"></i> Mais visibilidade e clientes</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Receba chamadas na região</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Gestão pelo aplicativo</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Cadastro 100% digital</li>
                        <li><i class="fa-solid fa-circle-check me-2"></i> Mais ganhos</li>
                    </ul>
                </div>
                <div class="split-img-box" style="background-image: url('assets/img/mecanico-feliz.png');"></div>
            </div>
        </div>
    </section>

    <section class="py-5 bg-white" id="recursos">
        <div class="container py-4 text-center">
            <div class="section-title mb-5">
                <h4 class="fw-bold text-dark-blue">RECURSOS DA PLATAFORMA</h4>
            </div>

            <div class="row row-cols-2 row-cols-md-4 row-cols-lg-8 justify-content-center text-center g-3">
                <div class="col"><i class="fa-solid fa-house-chimney-window fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Cadastro<br>Inteligente</p>
                </div>
                <div class="col"><i class="fa-solid fa-location-crosshairs fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Geolocalização<br>em tempo real</p>
                </div>
                <div class="col"><i class="fa-regular fa-bell fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Notificações<br>e alertas</p>
                </div>
                <div class="col"><i class="fa-solid fa-id-card-clip fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Credenciamento<br>Digital</p>
                </div>
                <div class="col"><i class="fa-solid fa-user-check fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Aprovação de<br>Parceiros</p>
                </div>
                <div class="col"><i class="fa-solid fa-table-cells-large fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Catálogo de<br>Serviços</p>
                </div>
                <div class="col"><i class="fa-solid fa-laptop-file fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Painel<br>Gerentes</p>
                </div>
                <div class="col"><i class="fa-solid fa-headset fs-2 text-blue-custom mb-2"></i>
                    <p class="small fw-medium lh-sm">Suporte<br>24 horas</p>
                </div>
            </div>
        </div>
    </section>

    <section class="py-5 bg-gray-light text-center">
        <div class="container">
            <h3 class="fw-bold text-dark-blue mb-1">BAIXE O APLICATIVO JÁ RESOLVE</h3>
            <p class="text-muted small mb-5">Disponível para Android e iOS. Baixe agora e tenha ajuda na palma da sua mão.</p>

            <div class="d-flex flex-wrap justify-content-center align-items-center gap-4">
                <div class="bg-white p-2 rounded-3 shadow-sm d-flex align-items-center gap-3 border">
                    <img src="assets/img/googleplay.png" alt="Google Play" height="60">
                    <img src="assets/img/qrcode.svg" alt="QR Code" height="60" class="border-start ps-3">
                </div>
                <img src="assets/img/icone-app-central.png" alt="App Icon" height="100" class="d-none d-md-block">
                <div class="bg-white p-2 rounded-3 shadow-sm d-flex align-items-center gap-3 border">
                    <img src="assets/img/appstore.png" alt="App Store" height="60">
                    <img src="assets/img/qrcode.svg" alt="QR Code" height="60" class="border-start ps-3">
                </div>
            </div>
        </div>
    </section>

    <section class="container my-5 py-4" id="contato">
        <div class="cta-wrapper shadow-lg">
            <div class="row w-100 g-0">
                <div class="col-lg-7 col-md-6 cta-text text-white d-flex flex-column justify-content-center">
                    <h2 class="fw-bold mb-4 display-6">Faça parte da maior rede de<br>assistência automotiva do Brasil!</h2>
                    <div class="d-flex gap-3 flex-wrap">
                        <a href="#" class="btn btn-red-primary px-4 py-2 rounded-pill fw-semibold" data-bs-toggle="modal" data-bs-target="#modalParceiro">Quero ser Parceiro</a>
                        <a href="#" class="btn bg-white text-dark-blue px-4 py-2 rounded-pill fw-semibold">Baixar Aplicativo <i class="fa-solid fa-download ms-1"></i></a>
                    </div>
                </div>
                <div class="col-lg-5 col-md-6 cta-image-bg d-none d-md-block"></div>
            </div>
        </div>
    </section>

    <?php include 'partials/footer.php'; ?>
    <?php include 'partials/modal.php'; ?>
    <?php include 'partials/scripts.php'; ?>

</body>

</html>