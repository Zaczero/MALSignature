<?php
// https://github.com/PHPMailer/PHPMailer
LOAD_ONCE("lib/mailer", [
	"Exception",
	"PHPMailer",
	"SMTP"
]);

class Mail {

	public static function send(string $target, string $subject, string $body, string $from = "") : bool {
		$mail = new \PHPMailer\PHPMailer\PHPMailer(true); // Passing `true` enables exceptions

		//$mail->SMTPDebug = 2; // Enable verbose debug output
		$mail->isSMTP();

		$mail->Host = MAIL_HOST;
		$mail->SMTPAuth = true;
		$mail->SMTPSecure = MAIL_ENCRYPTION;

		$mail->Username = MAIL_USER;
		$mail->Password = MAIL_PASS;

		$mail->Port = MAIL_PORT;
		$mail->CharSet = "utf-8";

		// fix smtp on localhost
		if(URL_DOMAIN === "localhost") {
			$mail->SMTPOptions = [
				"ssl" => [
					"verify_peer" => false,
					"verify_peer_name" => false,
					"allow_self_signed" => true,
				],
			];
		}

		$mail->setFrom(MAIL_USER);
		$mail->addAddress($target);

		if(!empty($from)) {
			$mail->addReplyTo($from);
		}

		$mail->isHTML(true); // Set email format to HTML / move down and set to false to disable
		$mail->Subject = $subject;
		$mail->Body = $body;

		return $mail->send();
	}

	public static function sendTemplate(string $template, string $target, string $subject, array $data) : bool {
		$body = file_get_contents(DIR."/mail/$template");

		foreach($data as $key => $value) {
			$body = str_replace("{".$key."}", $value, $body);
		}

		return mail::send($target, $subject, $body);
	}

	public static function isValid(string $email) : bool {
		if(!filter_var($email, FILTER_VALIDATE_EMAIL)) {
			return false;
		}

		$domain = substr(strrchr($email, "@"), 1);

		if(!checkdnsrr($domain, "MX")) {
			return false;
		}

		return true;
	}
}