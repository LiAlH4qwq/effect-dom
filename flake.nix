{
    description = "Type-safe DOM manipulation with explicit, composable error handling.";

    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        flake-parts.url = "github:hercules-ci/flake-parts";
    };

    outputs =
        inputs@{ flake-parts, ... }:
        flake-parts.lib.mkFlake { inherit inputs; } {
            systems = [
                "x86_64-linux"
                "aarch64-linux"
                "x86_64-darwin"
                "aarch64-darwin"
            ];

            perSystem =
                { pkgs, ... }:
                {
                    packages.default = pkgs.callPackage ./nix/package.nix { };

                    devShells.default = pkgs.mkShell {
                        packages = with pkgs; [
                            nodejs_26
                            pnpm_12
                            git
                        ];
                    };

                    formatter = pkgs.nixfmt;
                };
        };
}
