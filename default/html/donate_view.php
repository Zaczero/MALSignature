<?php
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

$id = GET("id");

if (empty($id)) exit_redirect("/?/donate");

$db = MysqliDb::getInstance();
$donate_row = $db->where("id", $id)->getOne("donations_electrum");

if (is_null($donate_row)) exit_redirect("/?/donate");

$qr_filename = DIR."/img/qr/{$donate_row["receive_address"]}.svg";

if (!file_exists($qr_filename)) {
	$options = new QROptions([
		"outputType" => QRCode::OUTPUT_MARKUP_SVG,
		"quietzoneSize" => 2,
	]);
	$qrcode = new QRCode($options);
	$qrcode->render("bitcoin:".$donate_row["receive_address"], $qr_filename);
}

define("HEAD_EXTRA", '<meta http-equiv="refresh" content="60">');
html_begin();
LOAD("template", ["navbar"]);
?>
<div class="container h-100">

	<div class="flex-center-wrap">

		<div class="card">
			<div class="card-body text-center">

				<h5 class="card-title mb-2">Donation Status <?=fa::brands("bitcoin")?></h5>
				<div class="card-subtitle mb-3">Bitcoin address: <a href="bitcoin:<?=$donate_row["receive_address"]?>" target="_blank"><?=$donate_row["receive_address"]?></a></div>

				<div class="row mb-3">
					<div class="col-sm-6 offset-sm-3">
						<img class="img-fluid" src="/img/qr/<?=$donate_row["receive_address"]?>.svg">
					</div>
				</div>

				<p class="mb-2" style="font-size: 14px">
					For your donation to be valid you have to send at least <?=$donate_row["amount_total"]?> BTC<br>
					Currently received: <?=$donate_row["amount_paid"]?> BTC
				</p>

				<?php
					if ($donate_row["is_completed"] === 0) {
						?>
						<h2 class="text-light mb-0">
							<?=fa::solid("spinner", "fa-spin")?>
						</h2>
						<?php
					}
					else {
						?>
						<h2 class="text-success mb-0">
							<?=fa::solid("check")?>
						</h2>
						<?php
					}
				?>

			</div>
		</div>

	</div>

</div>