{
    lib,
    stdenvNoCC,
    nodejs_26,
    pnpm_12,
    pnpmConfigHook,
    fetchPnpmDeps,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
    pname = "effect-dom";
    version = "0.1.1";

    src = lib.cleanSource ../.;

    pnpmDeps = fetchPnpmDeps {
        inherit (finalAttrs) pname version src;
        pnpm = pnpm_12;
        fetcherVersion = 4;
        hash = "sha256-6+8luAX4aLy4Dyz8yCcxYzyyclrYk/BqivDZ7h0icGA=";
    };

    nativeBuildInputs = [
        nodejs_26
        pnpm_12
        pnpmConfigHook
    ];

    buildInputs = [ finalAttrs.pnpmDeps ];

    buildPhase = ''
        runHook preBuild
        pnpm run build
        runHook postBuild
    '';

    installPhase = ''
        runHook preInstall
        mkdir -p $out
        cp -r dist $out/dist
        cp package.json $out/package.json
        cp README.md $out/README.md
        runHook postInstall
    '';

    meta = {
        description = "Type-safe DOM manipulation with explicit, composable error handling.";
        homepage = "https://github.com/lialh4qwq/effect-dom";
        license = lib.licenses.mit;
        platforms = lib.platforms.all;
    };
})
