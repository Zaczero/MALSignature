let
  pkgs =
    import
      (fetchTarball "https://github.com/NixOS/nixpkgs/archive/8edc0c72e3a38faf5434e40d1f19431125fe4b30.tar.gz")
      { };
in
pkgs.mkShellNoCC {
  packages = with pkgs; [
    bun
    nodejs # Wrangler's CLI runtime; the application server runs on Bun.
    typescript
    biome
    (writeShellScriptBin "nixpkgs-update" ''exec bun scripts/nixpkgs-update.ts "$@"'')
  ];
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ];
  shellHook = ''
    bun install --frozen-lockfile
  '';
}
