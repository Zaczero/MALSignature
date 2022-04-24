<?php
function LOAD(string $type, $files, bool $raw = false) : void {
	if(!is_array($files)) {
		$files = [$files];
	}

	$suffix = $raw === true ? "" : ".php";

	foreach($files as $file) {
		require DIR."/$type/$file$suffix";
	}
}

function LOAD_ONCE(string $type, $files, bool $raw = false) : void {
	if(!is_array($files)) {
		$files = [$files];
	}

	$suffix = $raw === true ? "" : ".php";

	foreach($files as $file) {
		require_once DIR."/$type/$file$suffix";
	}
}

function LOAD_CSS($files, string $base_dir = "css", string $extra_attr = "", bool $use_offset = true, bool $skip_extension = false) : void {
	if(!is_array($files)) {
		$files = [$files];
	}

	$prefix = $use_offset === true ? URL_OFFSET : "";
	$suffix = $skip_extension === true ? "" : ".css";

	foreach($files as $file) {
		if(!startsWith($file, "http")) {
			$file_path = "$prefix/$base_dir/$file$suffix";

			//$file_algo = FILE_INTEGRITY_ALGO;
			//$file_hash = base64_encode(hash_file($file_algo, DIR.$file_path, true));

			//$file_mtime = filemtime(DIR.$file_path);
			//$file_path .= "?mtime=".$file_mtime;
			echo "<link rel=\"stylesheet\" type=\"text/css\" href=\"$file_path\" $extra_attr>";
			//push_style($file_path, "integrity=\"$file_algo-$file_hash\"");
		}
		else {
			echo "<link rel=\"stylesheet\" type=\"text/css\" href=\"$file\" crossorigin=\"anonymous\" $extra_attr>";
		}
	}
}

function LOAD_JS($files, string $base_dir = "js", string $extra_attr = "", bool $use_offset = true, bool $skip_extension = false) : void {
	if(!is_array($files)) {
		$files = [$files];
	}

	$prefix = $use_offset === true ? URL_OFFSET : "";
	$suffix = $skip_extension === true ? "" : ".js";

	foreach($files as $file) {
		if(!startsWith($file, "http")) {
			$file_path = "$prefix/$base_dir/$file$suffix";

			//$file_algo = FILE_INTEGRITY_ALGO;
			//$file_hash = base64_encode(hash_file($file_algo, DIR.$file_path, true));

			//$file_mtime = filemtime(DIR.$file_path);
			//$file_path .= "?mtime=".$file_mtime;
			echo "<script type=\"text/javascript\" src=\"$file_path\" $extra_attr></script>";
			//push_script($file_path, "integrity=\"$file_algo-$file_hash\"");
		}
		else {
			echo "<script type=\"text/javascript\" src=\"$file\" crossorigin=\"anonymous\" $extra_attr></script>";
		}
	}
}

function POST(string $key, bool $secure = true) : string {
	if(!isset($_POST[$key])) {
		return "";
	}

	$val = trim($_POST[$key]);

	if($secure === true) {
		$val = htmlstrict($val);
	}

	return $val;
}

function GET(string $key, bool $secure = true) : string {
	if(!isset($_GET[$key])) {
		return "";
	}

	$val = trim($_GET[$key]);

	if($secure === true) {
		$val = htmlstrict($val);
	}

	return $val;
}

function COOKIE(string $key, bool $secure = true) : string {
	if(!isset($_COOKIE[$key])) {
		return "";
	}

	$val = trim($_COOKIE[$key]);

	if($secure === true) {
		$val = htmlstrict($val);
	}

	return $val;
}

function HTTP_HEADER(string $key, bool $secure = true) : string {
	$httpKey = "HTTP_" . strtoupper(str_replace("-", "_", $key));

	if (!isset($_SERVER[$httpKey])) {
		return "";
	}

	$val = trim($_SERVER[$httpKey]);

	if ($secure === true) {
		$val = htmlstrict($val);
	}

	return $val;
}
