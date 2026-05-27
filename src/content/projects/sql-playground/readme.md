# SQL Playground

An in-browser **SQL engine** running entirely on your machine.

The `demo` lazy-loads DuckDB-wasm, registers a small dataset of my
public commit history, and runs a few queries against it. Nothing
leaves your browser — DuckDB is compiled to WebAssembly and runs
client-side.

DuckDB is a 10 MB-ish download the first time you run it; after that
it's cached.

Run it: `run projects/sql-playground/demo`
