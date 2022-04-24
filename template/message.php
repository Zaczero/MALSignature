<?php
$json_safe = POST("json_safe");
$json_safe_sig = POST("json_safe_sig");

if(!empty($json_safe) && !empty($json_safe_sig)) {

	$json_safe_sig_local = hash_hmac(MESSAGE_ALGO, $json_safe, MESSAGE_SIG);
	if($json_safe_sig_local === $json_safe_sig) {

		$json = urldecode($json_safe);
		$arr = json_decode($json, true);

		$type = $arr["type"];
		$message = htmlstrict($arr["message"]);
		$js = null;

		switch($type) {
			case "success": {
				$js = 'toastr.success("'.$message.'", "Success!");';
			}
			break;
			case "info": {
				$js = 'toastr.info("'.$message.'", "Info");';
			}
			break;
			case "warning": {
				$js = 'toastr.warning("'.$message.'", "Oops!");';
			}
			break;
			case "error": {
				$js = 'toastr.error("'.$message.'", "Error :(");';
			}
			break;
		}

		if($js !== null) {
			echo
			'<script>
				toastr.options.closeButton = true;
				toastr.options.progressBar = true;
				toastr.options.preventDuplicates = true;
				toastr.options.messageClass = "toast-message";
				toastr.options.positionClass = "toast-top-right";
				'.$js.'
			</script>';
		}
	}
}