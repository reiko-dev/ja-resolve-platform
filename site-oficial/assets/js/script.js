$(document).ready(function(){

    // Aplicando Máscaras
    $('#cpf').mask('000.000.000-00', {reverse: true});
    $('#telefone').mask('(00) 00000-0000');

    // Smooth scrolling para os links da navbar
    $('a.nav-link').on('click', function(event) {
        if (this.hash !== "") {
            event.preventDefault();
            var hash = this.hash;
            
            // Adiciona a classe active no link clicado
            $('a.nav-link').removeClass('active');
            $(this).addClass('active');

            $('html, body').animate({
                scrollTop: $(hash).offset().top - 80 // -80 para compensar a navbar fixed
            }, 800);
        }
    });

    // Submissão do Formulário via AJAX
    $('#formParceiro').on('submit', function(event) {
        event.preventDefault();
        
        let form = $(this)[0];
        let btnSubmit = $('#btnSubmitParceiro');
        let btnText = $('.btn-text');
        let spinner = $('#loadingSpinner');

        // Validação nativa do Bootstrap
        if (!form.checkValidity()) {
            event.stopPropagation();
            form.classList.add('was-validated');
            return;
        }

        // Estado de Loading no botão
        btnSubmit.prop('disabled', true);
        btnText.text('Enviando...');
        spinner.removeClass('d-none');

        // Dispara o AJAX para o PHP
        $.ajax({
            url: 'processa_parceiro.php',
            type: 'POST',
            data: $(this).serialize(),
            dataType: 'json',
            success: function(response) {
                if(response.status === 'success') {
                    // Feedback de Sucesso com SweetAlert
                    Swal.fire({
                        icon: 'success',
                        title: 'Tudo Certo!',
                        text: response.message,
                        confirmButtonColor: '#e31c23'
                    }).then(() => {
                        // Reseta o form e fecha o modal
                        $('#formParceiro').removeClass('was-validated')[0].reset();
                        $('#modalParceiro').modal('hide');
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ops...',
                        text: response.message,
                        confirmButtonColor: '#0e1b31'
                    });
                }
            },
            error: function() {
                Swal.fire({
                    icon: 'error',
                    title: 'Erro de conexão',
                    text: 'Não foi possível enviar os dados. Tente novamente mais tarde.',
                    confirmButtonColor: '#0e1b31'
                });
            },
            complete: function() {
                // Restaura o botão
                btnSubmit.prop('disabled', false);
                btnText.text('Enviar Solicitação');
                spinner.addClass('d-none');
            }
        });
    });
});