<?php
// Importa as classes do PHPMailer para o escopo global
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Requer o Autoload do Composer (Ajuste o caminho se sua pasta vendor estiver em outro lugar)
require 'vendor/autoload.php';

header('Content-Type: application/json');

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    
    // Captura e sanitização básica dos dados
    $nome = htmlspecialchars(strip_tags($_POST['nome']));
    $cpf = htmlspecialchars(strip_tags($_POST['cpf']));
    $data_nascimento = htmlspecialchars(strip_tags($_POST['data_nascimento']));
    $telefone = htmlspecialchars(strip_tags($_POST['telefone']));
    $email = filter_var($_POST['email'], FILTER_SANITIZE_EMAIL);
    $cidade = htmlspecialchars(strip_tags($_POST['cidade']));
    $servico = htmlspecialchars(strip_tags($_POST['servico']));

    // Validação extra no backend
    if (empty($nome) || empty($email) || empty($telefone) || empty($servico)) {
        echo json_encode(['status' => 'error', 'message' => 'Preencha todos os campos obrigatórios.']);
        exit;
    }

    // Instancia o PHPMailer (passando 'true' habilita as exceções)
    $mail = new PHPMailer(true);

    try {
        // ----------------------------------------------------
        // 1. Configurações Globais do Servidor SMTP
        // ----------------------------------------------------
        $mail->isSMTP();
        // Host/usuário não são segredos; a senha DEVE vir de variável de
        // ambiente (SMTP_PASS) e nunca hardcoded no repositório.
        $mail->Host       = getenv('SMTP_HOST') ?: 'smtp.hostinger.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = getenv('SMTP_USER') ?: 'contato@jaresolve.com.br';
        $mail->Password   = getenv('SMTP_PASS') ?: '';
        if ($mail->Password === '') {
            echo json_encode(['status' => 'error', 'message' => 'Serviço de e-mail indisponível no momento. Tente novamente mais tarde.']);
            exit;
        }
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS; // ENCRYPTION_SMTPS (porta 465) ou ENCRYPTION_STARTTLS (porta 587)
        $mail->Port       = 465; 
        $mail->CharSet    = 'UTF-8';

        // Remetente padrão
        $mail->setFrom('contato@jaresolve.com.br', 'Já Resolve');

        // ----------------------------------------------------
        // 2. Envio de E-mail para a Equipe (Admin)
        // ----------------------------------------------------
        $mail->addAddress('contato@jaresolve.com.br', 'Equipe Já Resolve'); // Para quem vai o aviso
        $mail->addReplyTo($email, $nome); // Permite responder direto pro cliente

        $mail->isHTML(true);
        $mail->Subject = 'Novo Parceiro Interessado: ' . $nome;
        
        // Formata a data para o padrão brasileiro
        $data_br = date('d/m/Y', strtotime($data_nascimento));

        $mail->Body = "
            <h2>Novo interesse de parceria!</h2>
            <p><strong>Nome:</strong> {$nome}</p>
            <p><strong>CPF:</strong> {$cpf}</p>
            <p><strong>Data de Nasc.:</strong> {$data_br}</p>
            <p><strong>WhatsApp:</strong> {$telefone}</p>
            <p><strong>E-mail:</strong> {$email}</p>
            <p><strong>Cidade:</strong> {$cidade}</p>
            <p><strong>Serviço Oferecido:</strong> {$servico}</p>
        ";

        $mail->send();

        // ----------------------------------------------------
        // 3. Envio de E-mail de Confirmação para o Parceiro
        // ----------------------------------------------------
        $mail->clearAddresses(); // Limpa os destinatários anteriores
        $mail->clearReplyTos();  // Limpa o reply-to anterior
        
        $mail->addAddress($email, $nome); // Agora envia para o e-mail do parceiro
        
        $mail->Subject = 'Recebemos sua solicitação - Já Resolve';
        $mail->Body = "
            <h2>Olá, {$nome}!</h2>
            <p>Recebemos seus dados com sucesso. Agradecemos o interesse em fazer parte da rede <strong>Já Resolve</strong>.</p>
            <p>Você se cadastrou para oferecer serviços de <strong>{$servico}</strong>. Nossa equipe vai analisar suas informações e entrará em contato em breve através do WhatsApp cadastrado.</p>
            <br>
            <p>Abraços,<br>Equipe Já Resolve</p>
        ";

        $mail->send();

        // Se chegou até aqui sem cair no 'catch', tudo deu certo
        echo json_encode(['status' => 'success', 'message' => 'Seus dados foram enviados com sucesso! Entraremos em contato em breve.']);
        
    } catch (Exception $e) {
        // Nunca expor $mail->ErrorInfo (pode vazar detalhes de autenticação SMTP).
        error_log('processa_parceiro mail error: ' . $mail->ErrorInfo);
        echo json_encode(['status' => 'error', 'message' => 'Ocorreu um erro ao enviar a solicitação. Tente novamente mais tarde.']);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Método inválido.']);
}
?>