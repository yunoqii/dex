// Contract addresses on Sepolia
export const CONTRACTS = {
    FACTORY: "0x57cF51c31740c60b8B8798dACf510606C4E6F598",
    FEE_MANAGER: "0x4f816f8E36a5d2F7D7A53F4e43dD89abB481fed7",
    EIP712_SWAP: "0x1018D26dfcc2F1d681BED690210a0a9452Efc446",
    ACCESS_MANAGER: "0xb2f95C43eF4C5CbC167ECF6cD4c17eb92321488b",
    VAULT_MULTISIG: "0xFB99A40BdaEE03f95957e8d8EbCa93Ad6e3123D8",
} as const;

export const CHAIN_ID = 11155111; // Sepolia
export const RPC_URL = "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161";

// Common ERC20 ABI (simplified)
export const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
] as const;

// Factory ABI
export const FACTORY_ABI = [
    "function allPoolsLength() view returns (uint256)",
    "function allPools(uint256) view returns (address)",
    "function getPool(address, address) view returns (address)",
    "function createPool(address token0, uint256 token0Decimals, address token1, uint256 token1Decimals, address admin) returns (address)",
    "event PoolCreated(address indexed token0, address indexed token1, address pool, uint256 poolCount)",
] as const;

// Pool ABI
export const POOL_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function token0Decimals() view returns (uint256)",
    "function token1Decimals() view returns (uint256)",
    "function getReserves() view returns (uint256, uint256)",
    "function getPrice(address tokenIn, address tokenOut) view returns (uint256)",
    "function addLiquidity(address token, uint256 amount) returns (bool)",
    "function swap(address _sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) returns (uint256)",
    "function removeLiquidity(address token, uint256 amount) returns (bool)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
] as const;

// AccessManager ABI
export const ACCESS_MANAGER_ABI = [
    "function isAdmin(address) view returns (bool)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
] as const;

export const ROLES = {
    ADMIN_ROLE: "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775",
    DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
    MULTISIG_ADMIN_ROLE: "0x71e15edd14fd3418eb6412e352e9213f5344899ecebf19a3e57e7d605e2472b2",
    ALLOWED_EIP712_SWAP_ROLE: "0xb75d09aa91c6dffdeb8a9cc10aa0bee0d7d0f3fe42cb1b4b3619ac9cdea891e4",
} as const;

