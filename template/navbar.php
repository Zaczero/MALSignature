<nav class="navbar navbar-expand-lg fixed-top">

	<a class="navbar-brand py-0" href="/"><img src="/img/navbar-logo.png" alt="Navbar PNG logo" width="40" height="40"></a>

	<button class="navbar-toggler" data-target="#my-nav" data-toggle="collapse" aria-controls="my-nav" aria-expanded="false" aria-label="Toggle navigation">
		<span class="text-light"><?=fa::solid("bars")?></span>
	</button>

	<div id="my-nav" class="collapse navbar-collapse">
		<ul class="navbar-nav mr-auto">

			<li class="nav-item">
				<a class="nav-link" href="/?/ranking"><?=fa::regular("star")?> Ranking</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="/?/donate"><?=fa::regular("mug-hot")?> Donate</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="mailto:kamil@monicz.pl"><?=fa::regular("envelope")?> Contact</a>
			</li>

		</ul>
	</div>

</nav>

<footer class="footer fixed-bottom">
	Copyright © <?=date("Y")?> Kamil Monicz
</footer>