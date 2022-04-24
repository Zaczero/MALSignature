<?php
set_head_title_suffix("Donate and support the project 💝");
html_begin();
LOAD("template", ["navbar"]);
?>
<div class="container h-100">

	<div class="flex-center-wrap">

		<div class="card">
			<div class="card-body text-center">

				<h5 class="card-title mb-2">Donate <?=fa::solid("paw")?></h5>
				<div class="card-subtitle mb-3">Thanks for making this project possible</div>

				<form method="post" action="/?/api/donate">

					<div class="d-flex align-items-center mb-3">
						<input class="form-control form-control-sm mr-2" type="text" placeholder="Username (optional)" name="username">
						<i class="fa fa-fw fa-question-circle" data-toggle="tooltip" title="We will assign a supporter rank to this username on the ranking page"></i>
					</div>

					<?=Csrf::createField("donate")?>
					<button class="btn btn-sm btn-pill btn-primary" type="submit">Submit<?=fa::brands("bitcoin", "ml-1")?></button>

				</form>

			</div>
		</div>

	</div>

</div>