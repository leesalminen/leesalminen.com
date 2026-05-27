# Lightning Invoice

A working **tip jar** that doubles as a demo of LNURL-pay / LUD-16
(Lightning Addresses).

The `demo` resolves `lee@pay.bitcoinjungle.app` over the public web,
asks the LNURL-pay endpoint to mint a fresh BOLT11 invoice for the
amount you supply (in sats), and renders it as a scannable ASCII QR
code in your terminal.

Pay it from any Lightning wallet — Blink, Phoenix, Wallet of Satoshi,
Zeus, Strike — and the sats land in my Bitcoin Jungle wallet. No
servers in between, no analytics, no middlemen.

Run it: `run projects/lightning-invoice/demo 1000`  (1000 sats)
