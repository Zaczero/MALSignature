<?php
foreach($_GET as $key => $value) {
	if(startsWith($key, "amp;")) {
		$_GET[substr($key, 4)] = $value;
	}
}

$username = GET("username", false);
$style = GET("style");

if(empty($style)) {
	$style = "normal";
}

if(!SigManager::Get($username, $style === "small", false, $output_path, $err_message, $err_log)) {
	if($err_log === true) {
		trigger_error("[gene] SigManager::Get -> $err_message");
	}
	http_response_code(500);
	exit($err_message);
}

$update_timestamp = filemtime($output_path);
$update_etag = "\"$update_timestamp\"";

header("ETag: $update_etag");
header("Expires: ".gmdate("D, d M Y H:i:s \G\M\T", $update_timestamp + SIGNATURE_CACHE_TTL));
header("Cache-Control: public, immutable");
header("Content-Type: image/png");

if(HTTP_HEADER("If-None-Match") === $update_etag) {
	http_response_code(304);
	exit;
}

readfile($output_path);