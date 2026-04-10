# syntax=docker/dockerfile:1

# Stage 1: Build dependencies & application
FROM debian:bullseye-slim AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    git \
    curl \
    zip \
    unzip \
    tar \
    pkg-config \
    libssl-dev \
    libpq-dev \
    uuid-dev \
    zlib1g-dev \
    bison \
    flex \
    && rm -rf /var/lib/apt/lists/*

# Install vcpkg
WORKDIR /opt
RUN git clone https://github.com/microsoft/vcpkg.git \
    && ./vcpkg/bootstrap-vcpkg.sh

# Set vcpkg environment
ENV VCPKG_ROOT=/opt/vcpkg
ENV PATH="${PATH}:${VCPKG_ROOT}"

# Copy source code
WORKDIR /app
COPY . .

# Build dependencies and application
RUN mkdir build && cd build && \
    cmake -G Ninja .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=${VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake && \
    ninja && \
    ninja install

# Stage 2: Runtime image
FROM debian:bullseye-slim

# Install runtime dependencies (PostgreSQL client libs and OpenSSL)
RUN apt-get update && apt-get install -y \
    libssl1.1 \
    libpq5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/build/DrawEngine .
# Copy the config template
COPY --from=builder /app/config.json .

# Default port
EXPOSE 8080

# Start application
CMD ["./DrawEngine"]
