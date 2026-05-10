flowchart TD
START([processTx]) --> A1

    subgraph Round1["⚡ Round 1 — parallel"]
        A1[eth_getTransactionReceipt]
        A2[eth_getTransactionByHash]
    end

    A1 & A2 --> B{transfers.length == 0?}
    B -- "YES" --> E1([throw NO_ERC20_TRANSFER])
    B -- "NO" --> C{ignoredMethod\nignoreAddress?}
    C -- "YES" --> E2([throw IGNORED_METHOD\nIGNORED_ADDRESS])
    C -- "NO" --> D{matchedTos\n== 0?}
    D -- "YES" --> E3([throw NO_ERC20_TRANSFER])
    D -- "NO" --> F{isTransferSender?}

    F -- "NO" --> R1([return\ncalls=empty\ntokenSymbols=empty])

    F -- "YES" --> subgraph Round2["⚡ Round 2 — parallel"]
        G1[debug_traceTransaction]
    end

    G1 & G2 --> H[extractCalls\ndecodeReserves / balanceOf\ncompute isCallInput]
    H --> R2([return result])
