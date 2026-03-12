{
  description = "zellij-pane-tracker (Zellij WASM plugin) + mcp-server (Bun/TypeScript) dev flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
    bun2nix.url = "github:nix-community/bun2nix";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            rust-overlay.overlays.default
            inputs.bun2nix.overlays.default
          ];
        };
        lib = pkgs.lib;

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          targets = [ "wasm32-wasip1" ];
        };

        bun2nix = pkgs.bun2nix;

        makePlugin = import ./nix/makePlugin.nix {
          inherit pkgs lib rustToolchain;
        };

        zellij-pane-tracker = makePlugin {
          pname = "zellij-pane-tracker";
          version = "0.1.0";
          src = self;

          wasmFile = "zellij-pane-tracker.wasm";
          lockFile = ./Cargo.lock;

          meta = {
            description = "Zellij plugin that exports pane names to a JSON file for shell integration";
            license = lib.licenses.mit;
          };
        };

        baseMcpServer = bun2nix.mkDerivation {
          pname = "zellij-pane-mcp";
          version = "0.8.0";
          src = ./mcp-server;
          module = "index.ts";
          
          bunDeps = bun2nix.fetchBunDeps {
            bunNix = ./nix/bun.nix;
          };
        };

        mcp-server = pkgs.runCommand "zellij-pane-mcp-with-zjdump" {
          # baseMcpServer might have runtime deps; make them available
          inherit (baseMcpServer) passthru meta;
        } ''
          mkdir -p $out

          # Install zjdump into $out/bin
          mkdir -p $out/bin
          install -Dm755 ${./scripts/zjdump} $out/bin/zjdump

          # Copy the full base package output
          cp -R ${baseMcpServer}/* $out/
        '';
      in
      {
        packages = {
          default = zellij-pane-tracker;
          inherit zellij-pane-tracker mcp-server baseMcpServer;
        };

        devShells.default = pkgs.mkShell {
          packages = [ rustToolchain pkgs.bun pkgs.jq bun2nix ];
        };
      });
}
