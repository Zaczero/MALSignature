<?php
set_head_title_suffix("Generate your MyAnimeList.net signature 💮");
set_head_description("MALSignature.com is a free MyAnimeList.net signature and image generator. You can create your unique and auto-updating signature within few seconds. Select one of two built-in styles for your signature and stand out on the forums. Created and maintained by Zaczero");
html_begin();
LOAD("template", ["navbar"]);
?>
<div class="container h-100">

	<div class="flex-center-wrap">

		<div class="card">
			<div class="card-body text-center">

				<h5 class="card-title mb-2">MyAnimeList.net Signature Generator</h5>
				<div class="card-subtitle mb-3">version 3.2019 by <a href="https://monicz.pl" target="_blank">@Zaczero</a></div>

				<form method="post" action="/?/api/generateSignature">

					<input class="form-control form-control-sm mb-3" type="text" placeholder="Username" name="username" required>

					<?=Csrf::createField("generate")?>
					<button class="btn btn-sm btn-pill btn-primary" type="submit"><?=fa::solid("sun")?> Generate</button>

				</form>

			</div>
		</div>

	</div>

</div>