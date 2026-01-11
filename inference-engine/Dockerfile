FROM rust:latest as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM debian:buster-slim
FROM rust:1.70-slim
COPY --from=builder /usr/src/app/target/release/inference-engine /usr/local/bin/
EXPOSE 4000
CMD [ "inference-engine" ]
