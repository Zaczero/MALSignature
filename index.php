<?php
require_once "config.php";

function startsWith(string $haystack, string $needle) : bool {
	$length = strlen($needle);
	return (substr($haystack, 0, $length) === $needle);
}

function endsWith(string $haystack, string $needle) : bool {
	$length = strlen($needle);
	return $length === 0 || (substr($haystack, -$length) === $needle);
}

function startsWithi(string $haystack, string $needle) : bool {
	return startsWith(strtolower($haystack), strtolower($needle));
}

function endsWithi(string $haystack, string $needle) : bool {
	return endsWith(strtolower($haystack), strtolower($needle));
}

function htmlstrict(string $var) : string {
	$var = htmlentities($var);
	$var = htmlpreg($var);
	return $var;
}

function htmlpreg(string $var) : string {
	$var = preg_replace("/[^\w\s`~!@#$%^&*()\-_=+[\]{};:'\",.<>\/?\\|ę€óąśłżźćń]/u", "", $var);
	return $var;
}

function guidv4() : string {
	$data = random_bytes(16);
	$data[6] = chr(ord($data[6]) & 0x0f | 0x40); // set version to 0100
	$data[8] = chr(ord($data[8]) & 0x3f | 0x80); // set bits 6-7 to 10
	return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function random_float(int $min, int $max) : float {
	return random_int($min, $max - 1) + (random_int(0, PHP_INT_MAX - 1) / PHP_INT_MAX);
}

$query = $_SERVER["QUERY_STRING"];

if (!preg_match("/^(.*?)(?:(?:\?|&)(.*))?$/", $query, $queryMatches)) {
	http_response_code(400);
	exit("BAD QUERY");
}

$path = ltrim($queryMatches[1], "/"); // no absolute
$path = preg_replace("/\.{2,}/", ".", $path); // prevent dir change

if ($path == "" || preg_match("/\/$/", $path)) {
	$path .= "index.php"; // default index.php
}

if (!preg_match("/^.*\..*$/", $path, $files)) {
	$path .= ".php"; // auto-php
}

if (!preg_match("/\.php$/", $path)) {
	http_response_code(403); // only .php
	exit("FORBIDDEN");
}

// get args
if (isset($queryMatches[2])) {

	$args = $queryMatches[2];
	$argsEx = explode("&", $args);

	// get
	for($i = 0; $i < count($argsEx); $i++) {

		$argEx = explode("=", $argsEx[$i], 2);

		if (count($argEx) == 2) {

			$key = trim($argEx[0]);
			$val = trim($argEx[1]);

			$_GET[$key] = $val;
		}
	}
}

require_once DIR."/incl/input.php";
require_once "init.php";

if (!file_exists(DIR."/".HTML_ROOT."/html/$path")) {
	http_response_code(404);
	exit("NOT FOUND");
}

function set_head_title(string $content) : bool {
	return define("HEAD_TITLE", $content);
}

function set_head_title_suffix(string $content) : bool {
	return define("HEAD_TITLE_SUFFIX", $content);
}

function set_head_type(string $content) : bool {
	return define("HEAD_TYPE", $content);
}

function set_head_url(string $content) : bool {
	return define("HEAD_URL", $content);
}

function set_head_image(string $content) : bool {
	return define("HEAD_IMAGE", $content);
}

function set_head_description(string $content) : bool {
	return define("HEAD_DESCRIPTION", $content);
}

function set_head_extra(string $content) : bool {
	return define("HEAD_EXTRA", $content);
}

function html_begin() : void {
	echo
	'<!DOCTYPE html><html lang="en"><head>';

	LOAD("template", ["head"]);

	echo
	'</head><body>';
}

function html_end() : void {
	echo
	'</body></html>';
}

LOAD(HTML_ROOT."/html", [$path], true);
LOAD("template", ["foot", "message"]);
html_end();