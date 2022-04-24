<?php
if(!defined("HEAD_TITLE")) {

	$title = NAME;

	if(defined("HEAD_TITLE_SUFFIX")) {
		$title .= " - ".HEAD_TITLE_SUFFIX;
	}
	else {
		$url = $_SERVER["REQUEST_URI"];
		$url = preg_replace("/^\/*\?*\/*/", "", $url);
		if(strlen($url) > 0) {
			$parts = explode("/", $url);
			$title .= " - ";
			for($i = 0; $i < count($parts); $i++) {
				if($i != 0) {
					$title .= " / ";
				}
				$parts[$i] = str_replace("_", " ", $parts[$i]);
				$parts[$i] = explode("?", $parts[$i])[0];
				if($parts[$i] == "" || strpos($parts[$i], "=") !== false) {
					$parts[$i] = "Index";
				}
				$title .= ucwords($parts[$i]);
			}
		}
	}

	define("HEAD_TITLE", $title);
}

if(!defined("HEAD_TYPE")) {
	define("HEAD_TYPE", "website");
}

if(!defined("HEAD_URL")) {
	define("HEAD_URL", URL.$_SERVER["REQUEST_URI"]);
}

if(!defined("HEAD_IMAGE")) {
	define("HEAD_IMAGE", URL."/favicon.png?v=sep19");
}
?>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

<title><?=HEAD_TITLE?></title>
<link rel="shortcut icon" href="/favicon.ico?v=sep19">
<link rel="icon" sizes="16x16 32x32 48x64" href="/favicon.ico?v=sep19">

<link rel="icon" type="image/png" sizes="196x196" href="/favicon-192.png?v=may20">
<link rel="icon" type="image/png" sizes="160x160" href="/favicon-160.png?v=may20">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png?v=may20">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png?v=may20">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=sep19">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png?v=sep19">

<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=sep19">
<link rel="manifest" href="/site.webmanifest?v=sep19">
<link rel="mask-icon" href="/safari-pinned-tab.svg?v=sep19" color="#2e51a2">

<meta name="msapplication-TileColor" content="#0e1a33">
<meta name="msapplication-config" content="/browserconfig.xml">
<meta name="theme-color" content="#0e1a33">

<meta property="og:title" content="<?=HEAD_TITLE?>">
<meta property="og:type" content="<?=HEAD_TYPE?>">
<meta property="og:url" content="<?=HEAD_URL?>">
<meta property="og:image" content="<?=HEAD_IMAGE?>">

<?php
if(defined("HEAD_DESCRIPTION")) {
	echo '<meta property="og:description" content="'.HEAD_DESCRIPTION.'">';
	echo '<meta name="description" content="'.HEAD_DESCRIPTION.'">';
}

if(defined("HEAD_EXTRA")) {
	echo HEAD_EXTRA;
}

// Custom
LOAD_CSS("theme");

// Font Awesome
LOAD_CSS("fa/svg-with-js.min");

// Modernizr
//LOAD_JS("modernizr-webp", "js", "async");