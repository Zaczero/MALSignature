<?php
function async_json($data) {
	header("Content-Type: application/json");
	echo json_encode($data);
}

function exit_json($data) {
	async_json($data);
	exit;
}

function async_message($type, $message, $url = null) {
	if($url === null) {
		$url = ref_return();
	}

	$json = json_encode([
		"type" => $type,
		"message" => $message,
	]);

	$json_safe = urlencode($json);
	$json_safe_sig = hash_hmac(MESSAGE_ALGO, $json_safe, MESSAGE_SIG);

	?>
	<form id="form" method="POST" action="<?=$url?>">
		<input name="json_safe" type="hidden" value="<?=$json_safe?>">
		<input name="json_safe_sig" type="hidden" value="<?=$json_safe_sig?>">
		<noscript>
			<input type="submit" value="Click here to redirect">
		</noscript>
		<script>
			document.getElementById("form").submit();
		</script>
	</form>
	<?php
}

function exit_message($type, $message, $url = null) {
	async_message($type, $message, $url);
	exit;
}

function async_redirect($url = null) {
	if($url === null) {
		$url = ref_return();
	}

	if(headers_sent()) {
		echo '<script>location.replace("'.$url.'")</script>';
	}
	else {
		header("Location: $url");
	}
}

function exit_redirect($url = null) {
	async_redirect($url);
	exit;
}