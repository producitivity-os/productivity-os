workflows command="dev":
    cd apps/Workflows && yarn run tauri {{command}}

workflows-install:
    cd apps/Workflows && yarn install

workflows-check:
    cargo check --manifest-path apps/Workflows/src-tauri/Cargo.toml

workflows-clippy:
    cargo clippy --manifest-path apps/Workflows/src-tauri/Cargo.toml

workflows-fmt:
    cargo fmt --manifest-path apps/Workflows/src-tauri/Cargo.toml

workflows-clean:
    cargo clean --manifest-path apps/Workflows/src-tauri/Cargo.toml

canvas command="dev":
    just workflows {{command}}

canvas-install:
    just workflows-install

canvas-check:
    just workflows-check

canvas-clippy:
    just workflows-clippy

canvas-fmt:
    just workflows-fmt

canvas-clean:
    just workflows-clean
