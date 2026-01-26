# Apple Silicon optimized build with potential Metal support
FROM --platform=linux/arm64/v8 rust:1.84-slim AS builder

# For Apple Silicon, we need to build libtorch from source or use a compatible version
# Since official PyTorch doesn't provide ARM64 libtorch binaries, we'll use CPU version
RUN apt-get update && apt-get install -y \
    clang \
    libclang-dev \
    cmake \
    pkg-config \
    libssl-dev \
    wget \
    unzip \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# For Apple Silicon, we can try to use a CPU-only build
# Note: This will use CPU only, but optimized for ARM64
ENV TORCH_CUDA_VERSION=none

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Pre-build dependencies
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs && \
    echo "pub mod worker;" > src/lib.rs && \
    echo "pub fn run() {}" > src/worker.rs && \
    cargo build --release --target aarch64-unknown-linux-gnu && \
    rm -rf src

# Copy real source
COPY src ./src
RUN touch src/main.rs

# Build for ARM64
RUN cargo build --release --target aarch64-unknown-linux-gnu

# Runtime image for ARM64
FROM --platform=linux/arm64/v8 debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary
COPY --from=builder /app/target/aarch64-unknown-linux-gnu/release/inference-engine .

# Create model directory
RUN mkdir -p /app/models
RUN groupadd -r rustapp && useradd -r -g rustapp rustapp
RUN chown -R rustapp:rustapp /app
USER rustapp

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["./inference-engine"]