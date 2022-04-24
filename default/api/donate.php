<?php
exit("The donation system has been disabled due to no activity.<br>
If you really want to make a donation you can follow 'Support me' instructions here: https://github.com/Zaczero/LinqFasterer#-support-me<br>
If you would like to receive a Supporter rank just send me an email afterwards.<br>
Thanks!");

if(!Csrf::validate("donate")) {
	exit_message("warning", "Invalid CSRF");
}

$username = POST("username", false);

$db = MysqliDb::getInstance();
$electrum = new Electrum(RPC_USER, RPC_PASS, RPC_HOST, RPC_PORT);

if(!empty($username)) {
	$db->where("username", $username);
	$row = $db->getOne("signatures");

	if($row === null) {
		exit_message("warning", "Signature with this username does not exist");
	}
}

$id = guidv4();

$db->insert("donations_electrum", [
	"id" => $id,
	"receive_address" => $electrum->createnewaddress(),
	"amount_total" => DONATE_TOTAL,
	"amount_paid" => 0,
	"username" => $username,
	"create_time" => time(),
	"complete_time" => 0,
	"is_completed" => 0,
]);

exit_redirect("/?/donate_view?id=$id");