<?php
$db = MysqliDb::getInstance();
$last_height = $db->where("name", "last_height")->getOne("website_settings")["value"];

$electrum = new Electrum(RPC_USER, RPC_PASS, RPC_HOST, RPC_PORT);

foreach ($electrum->history(1, $last_height + 1, $last_height) as $receive_address => $amount) {
	$donate_row = $db->where("receive_address", $receive_address)->getOne("donations_electrum");
	if (is_null($donate_row)) continue;

	$amount_paid = $donate_row["amount_paid"] + $amount;

	if ($amount_paid >= $donate_row["amount_total"] && $donate_row["is_completed"] === 0) {
		if (!empty($donate_row["username"])) {
			$db->where("username", $donate_row["username"]);
			$db->update("signatures", [
				"is_supporter" => 1,
			]);
		}

		$db->where("id", $donate_row["id"])->update("donations_electrum", [
			"amount_paid" => $amount_paid,
			"complete_time" => time(),
			"is_completed" => 1,
		]);
	}
	else {
		$db->where("id", $donate_row["id"])->update("donations_electrum", [
			"amount_paid" => $amount_paid,
		]);
	}
}

$db->where("name", "last_height")->update("website_settings", ["value" => $last_height]);

if ($electrum->getbalance() >= DONATE_TOTAL) {
	$fee_rate = 1; //$electrum->getfeerate(0.1);
	$tx = $electrum->payto_max(DONATE_ADDRESS);
	$fee = $electrum->sat2btc($fee_rate * strlen($tx) / 2);

	$tx = $electrum->payto_max(DONATE_ADDRESS, $fee);
	$txid = $electrum->broadcast($tx);
}