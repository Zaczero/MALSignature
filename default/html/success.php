<?php
html_begin();
LOAD("template", ["navbar"]);

$username = GET("username", false);
$style = GET("style");

if(empty($style)) {
	$style = "normal";
}

if(!SigManager::Get($username, $style === "small", false, $output_path, $err_message, $err_log)) {
	exit_message("warning", $err_message);
}
?>
<div class="container h-100">
	
	<div class="flex-center-wrap">
		
		<div class="card w-100">
			<div class="card-body">
				
				<div class="text-center">

					<h5 class="card-title mb-2">Done <?=fa::solid("check")?></h5>

					<img class="img-thumbnail mb-3" src="<?=URL."/?/view?username=".urlencode($username)."&style=$style"?>">

					<div>
						<a class="btn btn-sm btn-pill btn-primary" href="/?/success?username=<?=urlencode($username)?>&style=<?=$style === "small" ? "normal" : "small"?>">Click here to view <b><?=$style === "small" ? "normal" : "compact"?></b> version of the signature <?=fa::solid("eye", "ml-1")?></a>
					</div>

				</div>

				<div class="form-group">
					<label for="signature_url"><?=fa::regular("brackets-curly")?> URL:</label>
					<input id="signature_url" class="form-control form-control-xsm" type="text" value="<?=URL."/?/view?username=".urlencode($username)."&style=$style"?>" onfocus="this.select()" readonly>
				</div>

				<div class="form-group">
					<label for="signature_url"><?=fa::regular("code")?> BBCode:</label>
					<input id="signature_url" class="form-control form-control-xsm" type="text" value="[URL=&quot;<?=URL?>&quot;][IMG]<?=URL."/?/view?username=".urlencode($username)."&style=$style"?>[/IMG][/URL]" onfocus="this.select()" readonly>
				</div>

				<div class="form-group">
					<label for="signature_url"><?=fa::brands("html5")?> HTML:</label>
					<input id="signature_url" class="form-control form-control-xsm" type="text" value="<a href=&quot;<?=URL?>&quot;><img src=&quot;<?=URL."/?/view?username=".urlencode($username)."&style=$style"?>&quot;></a>" onfocus="this.select()" readonly>
				</div>
				
			</div>
		</div>

	</div>

</div>