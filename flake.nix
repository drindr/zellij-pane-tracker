{
  description = "Zellij Pane MCP Server - AI assistant integration for Zellij terminal panes";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix";
  };

  outputs = { self, nixpkgs, flake-utils, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ inputs.bun2nix.overlays.default ];
        };
        lib = pkgs.lib;
        bun2nix = pkgs.bun2nix;

        mcp-server = bun2nix.mkDerivation {
          pname = "zellij-pane-mcp";
          version = "1.0.0";
          src = self;
          module = "index.ts";
          
          bunDeps = bun2nix.fetchBunDeps {
            bunNix = ./bun.nix;
          };
          
          meta = {
            description = "MCP server for Zellij pane management";
            license = lib.licenses.mit;
            mainProgram = "zellij-pane-mcp";
          };
        };
      in
      {
        packages = {
          default = mcp-server;
          inherit mcp-server;
        };

        devShells.default = pkgs.mkShell {
          packages = [ pkgs.bun bun2nix ];
        };
      });
}
