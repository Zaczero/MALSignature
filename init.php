<?php
// autoload
require_once DIR."/vendor/autoload.php";
foreach(glob(DIR."/incl/*.php") as $filename) {
	include_once $filename;
}

//Sentry\init(['dsn' => 'https://4dddf0d63a0b4843ad4c855651469b47@sentry.io/1814847' ]);

Csrf::getCookieKey();

// SHA1 (len: 40)
// SHA-3 256 (len: 64)
// PASSWORD_ARGON2I (len: 95)
// GUID (len: 36)

if(preg_match("/^cron\//", $path, $matches)) {
	if(php_sapi_name() !== "cli") {
		http_response_code(403);
		exit("UNAUTHORIZED");
	}

	else {
		if(file_exists(DIR."/".$path)) {
			ignore_user_abort(true);
			require_once DIR."/".$path;
			exit;
		}
		else {
			http_response_code(404);
			exit("NOT FOUND");
		}
	}
}

/*
if(preg_match("/^(api\/)?admin\//", $path, $matches)) {
	if (!me::IsAdmin()) {
		exit_redirect(URL_OFFSET."/");
	}
}
*/

/*
if(preg_match("/^(api\/)?user\//", $path, $matches)) {
	if (!me::IsLoggedIn()) {
		exit_redirect(URL_OFFSET."/");
	}
}
*/

if(preg_match("/^api\//", $path, $matches)) {
	if ($_SERVER["REQUEST_METHOD"] != "POST") {
		http_response_code(403);
		exit("UNAUTHORIZED");
	}

	else if(!isset($_SERVER["HTTP_REFERER"]) || parse_url($_SERVER["HTTP_REFERER"], PHP_URL_HOST) !== URL_DOMAIN) {
		http_response_code(403);
		exit("UNAUTHORIZED");
	}

	else {
		if(file_exists(DIR."/".HTML_ROOT."/".$path)) {
			ignore_user_abort(true);
			require_once DIR."/".HTML_ROOT."/".$path;
			exit;
		}
		else {
			http_response_code(404);
			exit("NOT FOUND");
		}
	}
}
