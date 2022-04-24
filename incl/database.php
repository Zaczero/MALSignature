<?php
// https://github.com/ThingEngineer/PHP-MySQLi-Database-Class
LOAD_ONCE("lib/database", ["MysqliDb", "dbObject"]);

$db = new MysqliDb(
	DATABASE_HOST, 
	DATABASE_USERNAME, 
	DATABASE_PASSWORD, 
	DATABASE_NAME, 
	DATABASE_PORT,
	DATABASE_CHARSET,
	DATABASE_SOCKET
);

//dbObject::autoload(DIR."/models");