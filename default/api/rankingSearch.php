<?php
if(!Csrf::validate("search")) {
	exit_message("warning", "Invalid CSRF");
}

$username = POST("username", false);

if(empty($username)) {
	exit_message("error", "Missing arg(s)");
}

$db = MysqliDb::getInstance();
$db->orderBy("views", "DESC");
$entries = $db->get("signatures");

for($i = 0; $i < count($entries); $i++) {
	$entry = $entries[$i];
	
	if(strcasecmp($entry["username"], $username) === 0) {
		$page = ($i / RANKING_ENTRIES_PER_PAGE) + 1;
		$page = (int) $page;
		$views_nice = number_format($entry["views"]);
		exit_message("success", "#".($i + 1)." {$entry["username"]} @ $views_nice views", "/?/ranking?page=$page");
	}
}

exit_message("info", "Username not found");