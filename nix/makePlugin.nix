{ pkgs, lib, rustToolchain }:
{ pname
, version
, src

, wasmFile

# Provide a lock file from *your* repo (not upstream).
# Example: ./nix/Cargo.lock
, lockFile ? ../Cargo.lock

, meta ? { }
, cargoBuildFlags ? [ ]
, extraNativeBuildInputs ? [ ]
, extraBuildInputs ? []
}:
let
  target = "wasm32-wasip1";

  # Install phase as a variable so it’s easy to reuse/override
  installWasmPhase = ''
    runHook preInstall
    install -Dm444 "target/${target}/release/${wasmFile}" "$out"
    runHook postInstall
  '';
in
pkgs.rustPlatform.buildRustPackage ({
  inherit pname version src;

  cargoLock = { inherit lockFile; };

  CARGO_BUILD_TARGET = target;

  dontCargoInstall = true;

  nativeBuildInputs = [ rustToolchain pkgs.pkg-config ] ++ extraNativeBuildInputs;
  buildInputs =
    [ pkgs.openssl ]
    ++ extraBuildInputs;

  buildPhase = ''
    runHook preBuild
    export HOME=$TMPDIR
    cargo build --release --target ${target}
    runHook postBuild
  '';

  installPhase = installWasmPhase;

  passthru = {
    # Absolute store path users can reference from configuration
    pluginWasm = "${placeholder "out"}/${wasmFile}";
    inherit wasmFile target;
  };

  meta = { platforms = lib.platforms.all; } // meta;
})
