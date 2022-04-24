<?php
$a_key = isset($_GET["amp;a"]) ? "amp;a" : "a";
$b_key = isset($_GET["amp;b"]) ? "amp;b" : "b";

if(!isset($_GET[$a_key])) {
	http_response_code(400);
	exit("invalid argument");
}

$_SERVER["QUERY_STRING"] = "/view";
$_GET["username"] = $_GET[$a_key];
$_GET["style"] = isset($_GET[$b_key]) && $_GET[$b_key] === "1" ? "small" : "normal";

require_once "index.php";
