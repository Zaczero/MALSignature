<?php
function ref_return() : string {
	
	$return = URL_OFFSET."/";

	if(isset($_SERVER["HTTP_REFERER"])) {

		$referer = $_SERVER["HTTP_REFERER"];
		$now = (isset($_SERVER["HTTPS"]) ? "https" : "http") . "://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";

		$ref_arr = explode("?", $referer);
		$now_arr = explode("?", $now);

		if(count($ref_arr) >= 2 && count($now_arr) >= 2 && $ref_arr[0] == $now_arr[0] && $ref_arr[1] == $now_arr[1]) {
			return $return . "?";
		}

		if(!preg_match("/\/api\//i", $referer, $matches)) {

			if(preg_match("/^http(s)?:\/\/(www\.)?".URL_DOMAIN."(\/\?)?.*?($|\?)/", $referer, $matches)) {

				if($matches[4] == "?") {
					$return = substr($matches[0], 0, strlen($matches[0]) - 1);
				}
				else{
					$return = $matches[0];
				}

				$analyze = substr($referer, strlen($return));
				$index = strpos($analyze, "?");

				if($index !== false) {
					$return .= substr($analyze, 0, $index);
				}
			}
		}
	}

	if(strpos($return, "?") === false) {
		$return .= "?";
	}

	return $return;
}