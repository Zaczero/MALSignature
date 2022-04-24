<?php
if(!Csrf::validate("generate")) {
	exit_message("warning", "Invalid CSRF");
}

$username = POST("username", false);

if(empty($username)) {
	exit_message("error", "Missing arg(s)");
}

if(!SigManager::Get($username, false, true, $output_path, $err_message, $err_log)) {
	if($err_log === true) {
		trigger_error("[gene] SigManager::Get -> $err_message");
	}
	exit_message("warning", $err_message);
}

SigManager::Get($username, true, true, $output_path, $err_message, $err_log);
exit_message("success", "Your signature has been generated", "/?/success?username=".urlencode($username)."&style=normal");