{
  description = "BackEndV3-Share development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              curl
              git
              jdk21
              jq
            ];

            JAVA_HOME = "${pkgs.jdk21}/lib/openjdk";

            shellHook = ''
              echo "BackEndV3-Share: Java $(java -version 2>&1 | head -n 1)"
            '';
          };
        });
    };
}
