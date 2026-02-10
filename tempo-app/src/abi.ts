export const tip20Abi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currency",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteToken",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const tip20FactoryAbi = [
  {
    type: "function",
    name: "isTIP20",
    inputs: [{ type: "address", name: "token" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { type: "address", name: "token", indexed: true },
      { type: "string", name: "name", indexed: false },
      { type: "string", name: "symbol", indexed: false },
      { type: "string", name: "currency", indexed: false },
      { type: "address", name: "quoteToken", indexed: false },
      { type: "address", name: "admin", indexed: false },
      { type: "bytes32", name: "salt", indexed: false },
    ],
  },
] as const;

export const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    inputs: [
      {
        type: "tuple[]",
        name: "calls",
        components: [
          { type: "address", name: "target" },
          { type: "bool", name: "allowFailure" },
          { type: "bytes", name: "callData" },
        ],
      },
    ],
    outputs: [
      {
        type: "tuple[]",
        name: "returnData",
        components: [
          { type: "bool", name: "success" },
          { type: "bytes", name: "returnData" },
        ],
      },
    ],
    stateMutability: "payable",
  },
] as const;
